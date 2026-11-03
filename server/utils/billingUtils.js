const { Setting } = require('../api/lib/mongodb');

/**
 * Default fallback settings
 */
const DEFAULT_SETTINGS = {
    key: 'general',
    societyName: 'Maple Apartments',
    address: '12-A, Maple Crossroad, Bangalore - 560001',
    defaultMaintenance: 2500,
    lateFeeAmount: 200,
    gracePeriodDays: 0,
    lateFeePercentage: 5,
    reminderTemplate: 'Dear Resident, your maintenance bill for [MONTH] of ₹[TOTAL] is due. Please pay via UPI or Cash to avoid late fees. — Management',
    billingStartDay: 1,
    defaultDueIntervalDays: 10,
    autoBillingEnabled: true,
    copyPreviousMonthRates: true,
    lastAutoBillingRun: null,
    lastGeneratedCycle: ''
};

/**
 * Retrieve system settings from database or seed with defaults
 */
async function getSystemSettings() {
    try {
        let setting = await Setting.findOne({ key: 'general' });
        if (!setting) {
            setting = await Setting.create(DEFAULT_SETTINGS);
        }
        return setting;
    } catch (err) {
        console.warn('⚠️ Could not fetch system settings from DB, using defaults:', err.message);
        return DEFAULT_SETTINGS;
    }
}

/**
 * Upsert system settings
 */
async function updateSystemSettings(data = {}) {
    const update = {};
    if (data.societyName !== undefined) update.societyName = String(data.societyName).trim();
    if (data.address !== undefined) update.address = String(data.address).trim();
    if (data.defaultMaintenance !== undefined) update.defaultMaintenance = Math.max(0, Number(data.defaultMaintenance) || 0);
    if (data.lateFeeAmount !== undefined) update.lateFeeAmount = Math.max(0, Number(data.lateFeeAmount) || 0);
    if (data.gracePeriodDays !== undefined) update.gracePeriodDays = Math.max(0, parseInt(data.gracePeriodDays, 10) || 0);
    if (data.lateFeePercentage !== undefined) update.lateFeePercentage = Math.max(0, Number(data.lateFeePercentage) || 0);
    if (data.reminderTemplate !== undefined) update.reminderTemplate = String(data.reminderTemplate);
    
    // Recurring Billing Automation Settings
    if (data.billingStartDay !== undefined) {
        update.billingStartDay = Math.min(31, Math.max(1, parseInt(data.billingStartDay, 10) || 1));
    }
    if (data.defaultDueIntervalDays !== undefined) {
        update.defaultDueIntervalDays = Math.min(60, Math.max(1, parseInt(data.defaultDueIntervalDays, 10) || 10));
    }
    if (data.autoBillingEnabled !== undefined) {
        update.autoBillingEnabled = Boolean(data.autoBillingEnabled === true || data.autoBillingEnabled === 'true' || data.autoBillingEnabled === 1 || data.autoBillingEnabled === '1');
    }
    if (data.copyPreviousMonthRates !== undefined) {
        update.copyPreviousMonthRates = Boolean(data.copyPreviousMonthRates === true || data.copyPreviousMonthRates === 'true' || data.copyPreviousMonthRates === 1 || data.copyPreviousMonthRates === '1');
    }
    if (data.lastAutoBillingRun !== undefined) {
        update.lastAutoBillingRun = data.lastAutoBillingRun ? new Date(data.lastAutoBillingRun) : null;
    }
    if (data.lastGeneratedCycle !== undefined) {
        update.lastGeneratedCycle = String(data.lastGeneratedCycle).trim();
    }
    update.updated_at = new Date();

    const updated = await Setting.findOneAndUpdate(
        { key: 'general' },
        { $set: update },
        { upsert: true, new: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );
    return updated;
}

/**
 * Calculates late fee for a single bill based on due date and system grace period.
 * 
 * Rules:
 * 1. If bill status is 'Paid', no extra late fee applies (keeps recorded late_fee if any).
 * 2. If bill status is 'Unpaid' (or not 'Paid'):
 *    - Compares current date with dueDate + gracePeriodDays.
 *    - If now > deadline, late fee penalty is applied.
 *    - totalPayable = baseTotal + lateFee.
 * 
 * @param {Object} bill - Mongoose Bill document or plain object
 * @param {Object} settings - System settings object
 * @returns {Object} { isOverdue: boolean, lateFee: number, baseAmount: number, totalPayable: number }
 */
function calculateBillLateFee(bill, settings = {}) {
    const isPaid = (bill.status || '').toLowerCase() === 'paid';
    const baseAmount = Number(bill.amount) || 0;

    if (isPaid) {
        const lateFee = Number(bill.late_fee) || 0;
        return {
            isOverdue: false,
            lateFee,
            baseAmount,
            totalPayable: baseAmount + lateFee
        };
    }

    const graceDays = Number(settings.gracePeriodDays) || 0;
    const configuredLateFee = Number(settings.lateFeeAmount !== undefined ? settings.lateFeeAmount : 200);

    let isOverdue = false;
    let lateFee = 0;

    if (bill.due_date) {
        const dueDate = new Date(bill.due_date);
        if (!isNaN(dueDate.getTime())) {
            // Calculate grace deadline: dueDate + graceDays (at end of that day)
            const deadline = new Date(dueDate.getTime() + (graceDays * 24 * 60 * 60 * 1000));
            deadline.setHours(23, 59, 59, 999);

            const now = new Date();
            if (now > deadline) {
                isOverdue = true;
                lateFee = configuredLateFee;
            }
        }
    }

    return {
        isOverdue,
        lateFee,
        baseAmount,
        totalPayable: baseAmount + lateFee
    };
}

/**
 * Enriches a bill object with calculated late fee properties
 */
function enrichBillWithLateFee(bill, settings) {
    const plain = bill.toObject ? bill.toObject() : { ...bill };
    const feeInfo = calculateBillLateFee(plain, settings);
    return {
        ...plain,
        baseAmount: feeInfo.baseAmount,
        lateFee: feeInfo.lateFee,
        late_fee: feeInfo.lateFee,
        isOverdue: feeInfo.isOverdue,
        totalPayable: feeInfo.totalPayable
    };
}

/**
 * Categorizes a flat's active bills into currentBill and previousUnpaidBills
 * and calculates all cumulative dues.
 * 
 * @param {Array} bills - Array of Bill documents (sorted or unsorted)
 * @param {Object} settings - System settings
 * @returns {Object} { currentBill, previousUnpaidBills, totalPreviousDue, currentTotal, grandTotal }
 */
function categorizeFlatBills(bills = [], settings = {}) {
    // Filter out archived or draft bills
    const activeBills = bills.filter(b => !b.is_archived && !b.is_draft);

    // Sort chronologically ascending (oldest first, newest last)
    activeBills.sort((a, b) => {
        const timeA = new Date(a.due_date || a.created_at || 0).getTime();
        const timeB = new Date(b.due_date || b.created_at || 0).getTime();
        return timeA - timeB;
    });

    const enrichedBills = activeBills.map(b => enrichBillWithLateFee(b, settings));
    const unpaidBills = enrichedBills.filter(b => (b.status || '').toLowerCase() === 'unpaid');

    let currentBill = null;
    let previousUnpaidBills = [];

    if (unpaidBills.length === 0) {
        // All bills paid; currentBill is the most recent bill (or null)
        currentBill = enrichedBills.length > 0 ? enrichedBills[enrichedBills.length - 1] : null;
        previousUnpaidBills = [];
    } else if (unpaidBills.length === 1) {
        // Only one unpaid bill exists; that is currentBill
        currentBill = unpaidBills[0];
        previousUnpaidBills = [];
    } else {
        // Multiple unpaid bills exist across cycles:
        // Newest unpaid bill is currentBill; all older unpaid bills are previousUnpaidBills
        currentBill = unpaidBills[unpaidBills.length - 1];
        previousUnpaidBills = unpaidBills.slice(0, unpaidBills.length - 1);
    }

    const totalPreviousDue = previousUnpaidBills.reduce((acc, b) => acc + (Number(b.totalPayable) || 0), 0);
    const currentTotal = currentBill && (currentBill.status || '').toLowerCase() === 'unpaid'
        ? (Number(currentBill.totalPayable) || 0)
        : 0;
    const grandTotal = currentTotal + totalPreviousDue;

    return {
        currentBill,
        previousUnpaidBills,
        totalPreviousDue,
        currentTotal,
        grandTotal,
        allEnrichedBills: enrichedBills
    };
}

const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

/**
 * Returns month and year info for a cycle relative to a base date or bill
 */
function getBillingCycleInfo(date = new Date(), offsetMonths = 0) {
    const d = new Date(date);
    d.setDate(1);
    d.setMonth(d.getMonth() + offsetMonths);
    const monthName = MONTH_NAMES[d.getMonth()];
    const year = d.getFullYear();
    return {
        month: `${monthName} ${year}`,
        monthName,
        year,
        monthIndex: d.getMonth()
    };
}

/**
 * Automatically determines the next cycle to bill based on latest existing bill in DB
 */
async function determineNextCycle(BillModel) {
    if (!BillModel) {
        const { Bill } = require('../api/lib/mongodb');
        BillModel = Bill;
    }

    const latestBill = await BillModel.findOne({
        is_archived: { $ne: true },
        month: { $exists: true, $ne: null }
    }).sort({ created_at: -1 });

    if (latestBill && latestBill.month) {
        const parts = String(latestBill.month).trim().split(/\s+/);
        if (parts.length >= 2) {
            const mName = parts[0];
            const y = parseInt(parts[1], 10);
            const mIdx = MONTH_NAMES.findIndex(m => m.toLowerCase() === mName.toLowerCase());
            if (mIdx !== -1 && !isNaN(y)) {
                const nextDate = new Date(y, mIdx + 1, 1);
                return getBillingCycleInfo(nextDate, 0);
            }
        }
    }

    return getBillingCycleInfo(new Date(), 1);
}

/**
 * Generates monthly rent bills for all resident rooms for a cycle.
 * Inherits base charges (maintenance, festival, parking, others) from prior cycle.
 * Prevents duplicate creation if cycle bills already exist.
 * Leaves unpaid previous bills intact so arrears naturally aggregate.
 */
async function generateMonthlyBillsCycle(options = {}) {
    const {
        targetMonth = null,
        targetYear = null,
        dueIntervalDays = null,
        copyPreviousRates = null,
        force = false,
        triggerSource = 'ADMIN_MANUAL'
    } = options;

    const { User, Bill, NotificationLog } = require('../api/lib/mongodb');
    const settings = await getSystemSettings();

    // 1. Determine cycle month and year
    let cycleInfo;
    if (targetMonth && targetYear) {
        const cleanMonthName = String(targetMonth).trim().split(/\s+/)[0];
        cycleInfo = {
            month: `${cleanMonthName} ${targetYear}`,
            monthName: cleanMonthName,
            year: Number(targetYear)
        };
    } else if (targetMonth) {
        const parts = String(targetMonth).trim().split(/\s+/);
        const mName = parts[0] || targetMonth;
        const y = parts[1] ? Number(parts[1]) : new Date().getFullYear();
        cycleInfo = {
            month: `${mName} ${y}`,
            monthName: mName,
            year: y
        };
    } else {
        cycleInfo = await determineNextCycle(Bill);
    }

    const intervalDays = dueIntervalDays !== null && dueIntervalDays !== undefined
        ? Number(dueIntervalDays)
        : (Number(settings.defaultDueIntervalDays) || 10);

    const shouldCopyRates = copyPreviousRates !== null && copyPreviousRates !== undefined
        ? Boolean(copyPreviousRates)
        : (settings.copyPreviousMonthRates !== false);

    const defaultMaint = Number(settings.defaultMaintenance) || 2500;

    // Calculate due date
    const mIdx = MONTH_NAMES.findIndex(m => m.toLowerCase() === (cycleInfo.monthName || '').toLowerCase());
    let calculatedDueDate;
    if (mIdx !== -1 && cycleInfo.year) {
        // e.g. 10th of the billing month
        calculatedDueDate = new Date(cycleInfo.year, mIdx, Math.min(28, Math.max(1, intervalDays)), 23, 59, 59, 999);
        if (calculatedDueDate < new Date()) {
            calculatedDueDate = new Date(Date.now() + (intervalDays * 24 * 60 * 60 * 1000));
        }
    } else {
        calculatedDueDate = new Date(Date.now() + (intervalDays * 24 * 60 * 60 * 1000));
    }

    // 2. Fetch all resident rooms
    const residents = await User.find({ role: 'User' }).sort({ flat_number: 1 });
    if (!residents || residents.length === 0) {
        return {
            success: false,
            message: 'No resident units found to generate bills for.',
            generatedCount: 0,
            skippedCount: 0
        };
    }

    const generatedBills = [];
    const skippedBills = [];

    for (const resident of residents) {
        const flatNo = resident.flat_number;

        // Check duplicate
        const existingBill = await Bill.findOne({
            flat_number: flatNo,
            month: cycleInfo.month,
            is_archived: { $ne: true }
        });

        if (existingBill && !force) {
            skippedBills.push({
                flat_number: flatNo,
                reason: 'Bill already exists for this cycle',
                billId: existingBill._id,
                amount: existingBill.amount
            });
            continue;
        }

        // Determine rate breakdown
        let maintenance = defaultMaint;
        let festival = 0;
        let parking = 0;
        let others = 0;

        if (shouldCopyRates) {
            // Find most recent bill before this cycle
            const prevBill = await Bill.findOne({
                flat_number: flatNo,
                is_archived: { $ne: true },
                month: { $ne: cycleInfo.month }
            }).sort({ created_at: -1 });

            if (prevBill) {
                maintenance = prevBill.maintenance !== undefined ? Number(prevBill.maintenance) : (Number(prevBill.amount) || defaultMaint);
                festival = Number(prevBill.festival) || 0;
                parking = Number(prevBill.parking) || 0;
                others = Number(prevBill.others) || 0;
            } else if (resident.charges) {
                maintenance = Number(resident.charges.rental || resident.maintenanceAmount || defaultMaint);
                festival = Number(resident.charges.festival) || 0;
                parking = Number(resident.charges.parking) || 0;
                others = Number(resident.charges.others) || 0;
            }
        } else {
            maintenance = Number(resident.charges?.rental || resident.maintenanceAmount || defaultMaint);
            festival = Number(resident.charges?.festival) || 0;
            parking = Number(resident.charges?.parking) || 0;
            others = Number(resident.charges?.others) || 0;
        }

        const totalAmount = maintenance + festival + parking + others;

        let targetBill = existingBill && force ? existingBill : new Bill();
        targetBill.flat_number = flatNo;
        targetBill.bill_type = 'Maintenance';
        targetBill.amount = totalAmount;
        targetBill.maintenance = maintenance;
        targetBill.festival = festival;
        targetBill.parking = parking;
        targetBill.others = others;
        targetBill.status = 'Unpaid';
        targetBill.is_draft = false;
        targetBill.notification_status = 'Sent';
        targetBill.notified_at = new Date();
        targetBill.due_date = calculatedDueDate;
        targetBill.month = cycleInfo.month;
        targetBill.year = cycleInfo.year;
        targetBill.late_fee = 0;
        targetBill.is_archived = false;
        if (!targetBill.created_at) targetBill.created_at = new Date();

        await targetBill.save();

        // Update resident record
        await User.findOneAndUpdate(
            { flat_number: flatNo },
            {
                $set: {
                    paymentStatus: 'unpaid',
                    dueDate: calculatedDueDate,
                    charges: { rental: maintenance, festival, parking, others },
                    notificationStatus: 'Sent'
                }
            }
        );

        // Record Notification log
        await NotificationLog.create({
            title: `Rent Bill Generated - ${cycleInfo.month}`,
            message: `New rent bill for ${cycleInfo.month} of ₹${totalAmount} has been generated for Flat ${flatNo}. Due Date: ${calculatedDueDate.toLocaleDateString('en-GB')}.`,
            type: 'Billing'
        }).catch(() => {});

        generatedBills.push({
            billId: targetBill._id,
            flat_number: flatNo,
            amount: totalAmount,
            maintenance,
            festival,
            parking,
            others,
            dueDate: calculatedDueDate,
            month: cycleInfo.month
        });
    }

    // Update settings with last run metadata
    await updateSystemSettings({
        lastAutoBillingRun: new Date(),
        lastGeneratedCycle: cycleInfo.month
    });

    return {
        success: true,
        message: `Successfully processed billing cycle for ${cycleInfo.month}`,
        cycle: cycleInfo.month,
        year: cycleInfo.year,
        dueDate: calculatedDueDate,
        generatedCount: generatedBills.length,
        skippedCount: skippedBills.length,
        totalRooms: residents.length,
        generatedBills,
        skippedBills,
        triggerSource
    };
}

/**
 * Checks if today matches configured start day and auto-runs generation
 */
async function checkAndRunScheduledAutoBilling(options = {}) {
    const { force = false } = options;
    const settings = await getSystemSettings();

    if (!settings.autoBillingEnabled && !force) {
        return {
            executed: false,
            reason: 'Recurring auto-billing is disabled in Admin Settings'
        };
    }

    const today = new Date();
    const todayDay = today.getDate();
    const targetDay = Number(settings.billingStartDay) || 1;

    // Check if today matches configured start day
    if (todayDay !== targetDay && !force) {
        return {
            executed: false,
            reason: `Today (day ${todayDay}) does not match configured Billing Start Day (day ${targetDay})`
        };
    }

    // Check if bills for current month cycle have already been generated
    const currentMonthCycle = getBillingCycleInfo(today, 0);
    const { Bill } = require('../api/lib/mongodb');
    const existingCount = await Bill.countDocuments({
        month: currentMonthCycle.month,
        is_archived: { $ne: true }
    });

    if (existingCount >= 16 && !force) {
        return {
            executed: false,
            cycle: currentMonthCycle.month,
            reason: `Bills for cycle ${currentMonthCycle.month} are already generated (${existingCount} bills found).`
        };
    }

    const result = await generateMonthlyBillsCycle({
        targetMonth: currentMonthCycle.monthName,
        targetYear: currentMonthCycle.year,
        dueIntervalDays: settings.defaultDueIntervalDays,
        copyPreviousRates: settings.copyPreviousMonthRates,
        triggerSource: 'CRON_SCHEDULER'
    });

    return {
        executed: true,
        ...result
    };
}

module.exports = {
    DEFAULT_SETTINGS,
    getSystemSettings,
    updateSystemSettings,
    calculateBillLateFee,
    enrichBillWithLateFee,
    categorizeFlatBills,
    getBillingCycleInfo,
    determineNextCycle,
    generateMonthlyBillsCycle,
    checkAndRunScheduledAutoBilling
};

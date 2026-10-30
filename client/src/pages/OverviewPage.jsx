import React, { useState, useEffect, useMemo } from 'react';

// Lucide icons or basic SVG if library unavailable
const IconEdit = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>;
const IconX = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
const IconSave = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>;
const IconDownload = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>;
const IconRotate = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>;

const STATUS_OPTIONS = [
  { value: 'paid', label: 'Paid', bg: 'bg-[#DCFCE7]', text: 'text-[#16A34A]' },
  { value: 'unpaid', label: 'Unpaid', bg: 'bg-[#FEE2E2]', text: 'text-[#DC2626]' },
  { value: 'partial', label: 'Partial', bg: 'bg-[#FEF3C7]', text: 'text-[#D97706]' },
  { value: 'overdue', label: 'Overdue', bg: 'bg-[#FEE2E2]', text: 'text-[#991B1B]', font: 'font-bold' }
];

const OverviewPage = () => {
  const [originalData, setOriginalData] = useState([]);
  const [tableData, setTableData] = useState([]);
  const [summary, setSummary] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingRow, setSavingRow] = useState(null);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [toast, setToast] = useState('');

  const token = sessionStorage.getItem('maple_token');

  const fetchOverview = async () => {
    try {
      setLoading(true);
      const res = await fetch('http://localhost:3000/api/overview/rooms', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Fetch failed');
      const data = await res.json();
      setOriginalData(JSON.parse(JSON.stringify(data.rooms)));
      setTableData(JSON.parse(JSON.stringify(data.rooms)));
      setSummary(data.summary);
    } catch (err) {
      console.error(err);
      showToast('Failed to load overview data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
  }, []);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const hasChanges = (rowId) => {
    const curr = tableData.find(r => r._id === rowId);
    const orig = originalData.find(r => r._id === rowId);
    return JSON.stringify(curr) !== JSON.stringify(orig);
  };

  const handleInputChange = (roomId, field, value, isCharge = false) => {
    setTableData(prev => prev.map(row => {
      if (row._id !== roomId) return row;
      const newRow = { ...row };
      
      if (isCharge) {
        newRow.charges = { ...newRow.charges, [field]: value };
      } else {
        newRow[field] = value;
      }

      // Auto-logic for status -> paidDate
      if (field === 'paymentStatus') {
        if (value === 'paid' && !newRow.paidDate) {
          newRow.paidDate = new Date().toISOString().split('T')[0];
        } else if (value === 'unpaid' || value === 'overdue') {
          newRow.paidDate = '';
        }
      }

      return newRow;
    }));
  };

  const saveRow = async (roomId) => {
    try {
      setSavingRow(roomId);
      const row = tableData.find(r => r._id === roomId);
      
      const res = await fetch(`http://localhost:3000/api/overview/rooms/${roomId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          charges: row.charges,
          dueDate: row.dueDate,
          paymentStatus: row.paymentStatus,
          paidDate: row.paidDate,
          notes: row.notes
        })
      });
      
      if (!res.ok) throw new Error('Update failed');
      
      // Update originalData for this row
      setOriginalData(prev => prev.map(r => r._id === roomId ? JSON.parse(JSON.stringify(row)) : r));
      showToast(`Room ${row.roomNumber} saved`);
      
      // Background refresh summary
      fetchOverview();
    } catch (err) {
      showToast('Save failed');
    } finally {
      setSavingRow(null);
    }
  };

  const saveAllChanges = async () => {
    const changedRows = tableData.filter(r => hasChanges(r._id));
    if (changedRows.length === 0) {
      setEditMode(false);
      return;
    }
    
    try {
      setBulkSaving(true);
      const payload = changedRows.map(r => ({
        roomId: r._id,
        charges: r.charges,
        dueDate: r.dueDate,
        paymentStatus: r.paymentStatus,
        paidDate: r.paidDate,
        notes: r.notes
      }));
      
      const res = await fetch(`http://localhost:3000/api/overview/rooms/bulk-update`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(payload)
      });
      
      if (!res.ok) throw new Error('Bulk update failed');
      
      showToast(`${changedRows.length} rooms updated successfully`);
      setEditMode(false);
      fetchOverview(); // re-fetch full state
    } catch (err) {
      showToast('Bulk update failed');
    } finally {
      setBulkSaving(false);
    }
  };

  const discardChanges = () => {
    if (window.confirm('Discard all unsaved changes?')) {
      setTableData(JSON.parse(JSON.stringify(originalData)));
      setEditMode(false);
    }
  };

  const exportCSV = () => {
    const headers = ['Room No.', 'Floor', 'Resident', 'Rental', 'Festival', 'Parking', 'Others', 'Total', 'Due Date', 'Status', 'Paid On', 'Notes'];
    const rows = tableData.map(r => {
      const c = r.charges || {};
      const total = Number(c.rental||0) + Number(c.festival||0) + Number(c.parking||0) + Number(c.others||0);
      return [
        r.roomNumber,
        r.floor,
        `"${r.resident?.name || ''}"`,
        c.rental || 0,
        c.festival || 0,
        c.parking || 0,
        c.others || 0,
        total,
        r.dueDate ? new Date(r.dueDate).toISOString().split('T')[0] : '',
        r.paymentStatus || '',
        r.paidDate ? new Date(r.paidDate).toISOString().split('T')[0] : '',
        `"${r.notes || ''}"`
      ];
    });
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Overview-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const renderStatus = (status) => {
    const s = STATUS_OPTIONS.find(o => o.value === status) || STATUS_OPTIONS[1];
    return <span className={`px-2 py-1 rounded-full text-xs uppercase tracking-wider ${s.bg} ${s.text} ${s.font || 'font-medium'}`}>{s.label}</span>;
  };

  if (loading) {
    return (
      <div className="p-8 max-w-7xl mx-auto space-y-4">
        <div className="h-20 bg-gray-200 animate-pulse rounded-xl w-1/3 mb-10"></div>
        {[...Array(6)].map((_, i) => <div key={i} className="h-16 bg-gray-100 animate-pulse rounded-xl w-full"></div>)}
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8 max-w-[1600px] mx-auto min-h-screen bg-gray-50 text-gray-900 font-sans">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Room Overview</h1>
          <p className="text-gray-500 mt-1">{new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          {editMode && (
            <>
              <button onClick={discardChanges} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-200 rounded-lg transition-colors">
                <IconRotate /> Discard
              </button>
              <button disabled={bulkSaving} onClick={saveAllChanges} className="flex items-center gap-2 px-6 py-2 text-sm font-bold text-white bg-[#F97316] hover:bg-orange-600 rounded-lg transition-colors shadow-lg shadow-orange-200">
                {bulkSaving ? 'Saving...' : <><IconSave /> Save All</>}
              </button>
            </>
          )}
          
          <button onClick={() => setEditMode(!editMode)} className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${editMode ? 'bg-gray-800 text-white hover:bg-gray-900' : 'bg-white border border-gray-200 hover:bg-gray-50 text-gray-700'}`}>
            {editMode ? <><IconX /> Exit Edit Mode</> : <><IconEdit /> Edit Mode</>}
          </button>
          
          <button onClick={exportCSV} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold border border-gray-200 bg-white hover:bg-gray-50 rounded-lg transition-colors">
            <IconDownload /> CSV
          </button>
        </div>
      </div>
      
      {/* SUMMARY CARDS */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm border-t-4 border-t-gray-400">
            <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Total Rooms</p>
            <h3 className="text-2xl font-black mt-1">{summary.totalRooms}</h3>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm border-t-4 border-t-[#16A34A]">
            <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Paid</p>
            <h3 className="text-2xl font-black mt-1 text-[#16A34A]">{summary.paidCount}</h3>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm border-t-4 border-t-[#DC2626]">
            <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Unpaid</p>
            <h3 className="text-2xl font-black mt-1 text-[#DC2626]">{summary.unpaidCount}</h3>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm border-t-4 border-t-[#F97316]">
            <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Total Billed</p>
            <h3 className="text-2xl font-black mt-1 text-[#F97316]">₹{summary.totalBilled.toLocaleString()}</h3>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm border-t-4 border-t-[#991B1B]">
            <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Pending</p>
            <h3 className="text-2xl font-black mt-1 text-[#991B1B]">₹{summary.totalPending.toLocaleString()}</h3>
          </div>
        </div>
      )}

      {/* TABLE */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden relative">
        {bulkSaving && <div className="absolute inset-0 z-50 bg-white/50 backdrop-blur-sm flex items-center justify-center font-bold text-lg">Saving all records...</div>}
        
        <div className="overflow-x-auto">
          <table className="w-full text-left whitespace-nowrap">
            <thead className="bg-gray-800 text-white text-xs font-semibold uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4 sticky left-0 z-20 bg-gray-800">Room No.</th>
                <th className="px-6 py-4 sticky left-[100px] z-20 bg-gray-800 border-r border-gray-700">Resident Name</th>
                <th className="px-6 py-4">Floor</th>
                <th className="px-6 py-4">Rental (₹)</th>
                <th className="px-6 py-4">Festival (₹)</th>
                <th className="px-6 py-4">Parking (₹)</th>
                <th className="px-6 py-4">Others (₹)</th>
                <th className="px-6 py-4 text-[#F97316] font-bold">Total (₹)</th>
                <th className="px-6 py-4">Due Date</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Paid On</th>
                <th className="px-6 py-4 w-48">Notes</th>
                {editMode && <th className="px-6 py-4 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="text-sm divide-y divide-gray-100">
              {tableData.length === 0 ? (
                <tr><td colSpan="13" className="p-8 text-center text-gray-500">No rooms added yet.</td></tr>
              ) : tableData.map((row) => {
                const isChanged = hasChanges(row._id);
                const c = row.charges || {};
                const total = Number(c.rental||0) + Number(c.festival||0) + Number(c.parking||0) + Number(c.others||0);
                
                const leftBorderColor = row.paymentStatus === 'paid' ? 'border-l-4 border-l-[#16A34A]' : 
                                        row.paymentStatus === 'partial' ? 'border-l-4 border-l-[#D97706]' : 
                                        row.paymentStatus === 'overdue' ? 'border-l-4 border-l-[#991B1B]' : 'border-l-4 border-l-transparent';
                
                const trClass = `
                  ${row.paymentStatus === 'overdue' ? 'bg-red-50/40' : index % 2 === 0 ? 'bg-white' : 'bg-[#fcfcfc]'}
                  ${editMode && isChanged ? 'bg-orange-50/50' : ''}
                  transition-colors hover:bg-gray-50
                `;

                // Standard input class
                const inputClass = "w-full bg-transparent border-b border-gray-300 focus:border-[#F97316] outline-none py-1 px-1 focus:bg-orange-50/30 transition-all font-medium text-gray-800 disabled:opacity-50 disabled:cursor-not-allowed";

                return (
                  <tr key={row._id} className={trClass}>
                    {/* STICKY COLS */}
                    <td className={`px-6 py-4 sticky left-0 z-10 font-bold bg-inherit ${leftBorderColor} shadow-[1px_0_0_0_#f3f4f6]`}>
                      <span className="bg-[#F97316] text-white px-2.5 py-1 rounded-md shadow-sm relative">
                        {row.roomNumber}
                        {editMode && isChanged && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border border-white"></span>}
                      </span>
                    </td>
                    <td className="px-6 py-4 sticky left-[100px] z-10 bg-inherit font-semibold text-gray-800 shadow-[1px_0_0_0_#e5e7eb]">
                      {row.resident?.name || <span className="text-gray-400 italic">Vacant</span>}
                    </td>

                    <td className="px-6 py-4 text-gray-500">{row.floor || '-'}</td>
                    
                    {/* CHARGES */}
                    <td className="px-6 py-4">
                      {editMode ? <input type="number" value={c.rental||0} onChange={(e)=>handleInputChange(row._id, 'rental', e.target.value, true)} className={inputClass} /> : `₹${c.rental||0}`}
                    </td>
                    <td className="px-6 py-4">
                      {editMode ? <input type="number" value={c.festival||0} onChange={(e)=>handleInputChange(row._id, 'festival', e.target.value, true)} className={inputClass} /> : `₹${c.festival||0}`}
                    </td>
                    <td className="px-6 py-4">
                      {editMode ? <input type="number" value={c.parking||0} onChange={(e)=>handleInputChange(row._id, 'parking', e.target.value, true)} className={inputClass} /> : `₹${c.parking||0}`}
                    </td>
                    <td className="px-6 py-4">
                      {editMode ? <input type="number" value={c.others||0} onChange={(e)=>handleInputChange(row._id, 'others', e.target.value, true)} className={inputClass} /> : `₹${c.others||0}`}
                    </td>
                    
                    {/* TOTAL */}
                    <td className="px-6 py-4 font-black text-[#F97316] text-base">₹{total.toLocaleString()}</td>

                    {/* DATES & STATUS */}
                    <td className="px-6 py-4">
                      {editMode ? 
                        <input type="date" value={row.dueDate ? new Date(row.dueDate).toISOString().split('T')[0] : ''} onChange={(e)=>handleInputChange(row._id, 'dueDate', e.target.value)} className={inputClass} /> 
                      : (row.dueDate ? new Date(row.dueDate).toLocaleDateString() : '-')}
                    </td>
                    <td className="px-6 py-4">
                      {editMode ? (
                        <select value={row.paymentStatus} onChange={(e)=>handleInputChange(row._id, 'paymentStatus', e.target.value)} className="w-full bg-transparent border-b border-gray-300 focus:border-[#F97316] outline-none py-1 text-sm font-medium">
                          {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      ) : renderStatus(row.paymentStatus)}
                    </td>
                    <td className="px-6 py-4">
                      {editMode ? 
                        <input type="date" disabled={row.paymentStatus !== 'paid'} value={row.paidDate ? new Date(row.paidDate).toISOString().split('T')[0] : ''} onChange={(e)=>handleInputChange(row._id, 'paidDate', e.target.value)} className={inputClass} /> 
                      : (row.paidDate && row.paymentStatus === 'paid' ? new Date(row.paidDate).toLocaleDateString() : '-')}
                    </td>
                    <td className="px-6 py-4">
                      {editMode ? 
                        <input type="text" value={row.notes || ''} onChange={(e)=>handleInputChange(row._id, 'notes', e.target.value)} placeholder="Add note..." className={inputClass} /> 
                      : <span className="text-gray-500 truncate block max-w-[150px]" title={row.notes}>{row.notes || '-'}</span>}
                    </td>

                    {/* ACTIONS */}
                    {editMode && (
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {isChanged ? (
                            <>
                              <button onClick={() => setTableData(prev => prev.map(r => r._id === row._id ? JSON.parse(JSON.stringify(originalData.find(o => o._id === row._id))) : r))} className="p-1 px-2 text-xs text-gray-500 hover:bg-gray-100 rounded transition-colors" title="Reset Row"><IconRotate /></button>
                              <button onClick={() => saveRow(row._id)} disabled={savingRow === row._id} className="p-1 px-3 text-xs bg-[#F97316] text-white rounded font-bold hover:bg-orange-600 transition-colors shadow-md">
                                {savingRow === row._id ? '...' : 'Save'}
                              </button>
                            </>
                          ) : <span className="text-xs text-gray-300 font-medium">Saved</span>}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* GLOBAL TOAST */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-gray-900 text-white px-6 py-3 rounded-xl shadow-2xl font-medium animate-bounce">
          ✓ {toast}
        </div>
      )}
    </div>
  );
};

export default OverviewPage;

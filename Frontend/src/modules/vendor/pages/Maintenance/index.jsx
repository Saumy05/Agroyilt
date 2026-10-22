import React, { useState, useEffect } from 'react';
import { FiCalendar, FiPlus, FiTrash2, FiClock, FiAlertCircle, FiChevronLeft } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import Header from '../../components/layout/Header';
import BottomNav from '../../components/layout/BottomNav';
import { vendorTheme as themeColors } from '../../../../theme';
import maintenanceService from '../../services/maintenanceService';
import { vendorEquipmentService } from '../../../../services/vendorEquipmentService';
import { toastManager } from '../../../../utils/toastManager';
import { format } from 'date-fns';

const MaintenanceIndex = () => {
    const navigate = useNavigate();
    const [schedules, setSchedules] = useState([]);
    const [equipments, setEquipments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);

    // Form state
    const [formData, setFormData] = useState({
        equipmentId: '',
        startDate: '',
        endDate: '',
        reason: 'Routine Checkup',
        note: ''
    });

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [schedRes, equipRes] = await Promise.all([
                maintenanceService.getSchedules(),
                vendorEquipmentService.getMyEquipment()
            ]);
            setSchedules(schedRes.data || []);
            setEquipments(equipRes.data || []);
        } catch (err) {
            toastManager.error('Failed to load maintenance data');
        } finally {
            setLoading(false);
        }
    };

    const handleAdd = async (e) => {
        e.preventDefault();
        try {
            await maintenanceService.addSchedule(formData);
            toastManager.success('Maintenance scheduled successfully');
            setIsModalOpen(false);
            fetchData();
        } catch (err) {
            toastManager.error(err.response?.data?.message || 'Failed to schedule maintenance');
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to cancel this maintenance?')) return;
        try {
            await maintenanceService.deleteSchedule(id);
            toastManager.success('Maintenance cancelled');
            fetchData();
        } catch (err) {
            toastManager.error('Failed to cancel maintenance');
        }
    };

    return (
        <div className="min-h-screen pb-20" style={{ background: themeColors.backgroundGradient }}>
            <Header title="Machine Care & Maintenance" />

            <main className="px-4 py-6">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-lg font-bold text-gray-800">Maintenance Logic & Schedules</h2>
                    <button
                        onClick={() => setIsModalOpen(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-xl shadow-lg active:scale-95 transition-all text-sm font-bold"
                    >
                        <FiPlus /> Schedule Downtime / Service
                    </button>
                </div>

                {loading ? (
                    <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div></div>
                ) : schedules.length === 0 ? (
                    <div className="bg-white rounded-2xl p-8 text-center shadow-sm border border-gray-100">
                        <FiCalendar className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                        <p className="text-gray-500 font-medium">No maintenance scheduled yet.</p>
                        <p className="text-xs text-gray-400 mt-1">Keep your machines in top shape for the field.</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {schedules.map(item => (
                            <div key={item._id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex items-center justify-between">
                                <div className="flex gap-4 items-center">
                                    <div className="w-12 h-12 rounded-xl bg-teal-50 flex items-center justify-center text-teal-600">
                                        <FiClock className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-gray-800">{item.equipmentId?.name || 'Equipment removed'}</h3>
                                        <p className="text-xs text-gray-500 font-medium">
                                            {format(new Date(item.startDate), 'dd MMM')} - {format(new Date(item.endDate), 'dd MMM, yyyy')}
                                        </p>
                                        <span className="inline-block mt-1 px-2 py-0.5 bg-yellow-100 text-yellow-700 text-[10px] font-bold rounded uppercase">
                                            {item.reason}
                                        </span>
                                    </div>
                                </div>
                                <button
                                    onClick={() => handleDelete(item._id)}
                                    className="p-3 text-red-500 hover:bg-red-50 rounded-full transition-all"
                                >
                                    <FiTrash2 className="w-5 h-5" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </main>

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
                    <div className="bg-white w-full max-w-md rounded-3xl overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200">
                        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-teal-600">
                            <h3 className="text-xl font-bold text-white">Schedule Maintenance</h3>
                            <button onClick={() => setIsModalOpen(false)} className="text-white hover:rotate-90 transition-all"><FiPlus className="rotate-45 w-6 h-6" /></button>
                        </div>
                        <form onSubmit={handleAdd} className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Select Equipment</label>
                                <select
                                    required
                                    className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none text-sm font-medium"
                                    value={formData.equipmentId}
                                    onChange={e => setFormData({ ...formData, equipmentId: e.target.value })}
                                >
                                    <option value="">Select Machine...</option>
                                    {equipments.map(e => <option key={e._id} value={e._id}>{e.name}</option>)}
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Start Date</label>
                                    <input
                                        type="date"
                                        required
                                        className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm"
                                        value={formData.startDate}
                                        onChange={e => setFormData({ ...formData, startDate: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">End Date</label>
                                    <input
                                        type="date"
                                        required
                                        className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm"
                                        value={formData.endDate}
                                        onChange={e => setFormData({ ...formData, endDate: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Reason</label>
                                <select
                                    className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm"
                                    value={formData.reason}
                                    onChange={e => setFormData({ ...formData, reason: e.target.value })}
                                >
                                    <option>Routine Checkup</option>
                                    <option>Repair</option>
                                    <option>Servicing</option>
                                    <option>Breakdown</option>
                                    <option>Other</option>
                                </select>
                            </div>
                            <button
                                type="submit"
                                className="w-full py-4 bg-teal-600 text-white font-bold rounded-2xl shadow-lg active:scale-95 transition-all mt-4 hover:brightness-110"
                            >
                                Confirm & Block Machine
                            </button>
                        </form>
                    </div>
                </div>
            )}

            <BottomNav />
        </div>
    );
};

export default MaintenanceIndex;

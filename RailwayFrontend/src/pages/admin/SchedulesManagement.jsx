import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Plus, Edit, Trash2, Clock, Calendar, AlertCircle, Loader, Search, ChevronLeft, ChevronRight, Moon, Lock } from 'lucide-react';
import Button from '@/components/ui/button';
import ScheduleFormModal from '@/components/ScheduleManage/ScheduleFormModal';
import ConfirmDialog from '@/components/ScheduleManage/ConfirmDialog';
import schedulesApi from '@/api/schedules';
import trainsApi from '@/api/trains';

const SchedulesManagement = () => {
  const [schedules, setSchedules] = useState([]);
  const [trains, setTrains] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Toast notification state
  const [toast, setToast] = useState(null);

  // Modal states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  // Selected items
  const [selectedSchedule, setSelectedSchedule] = useState(null);
  const [deleteId, setDeleteId] = useState(null);

  // Action loading state
  const [actionLoading, setActionLoading] = useState(false);

  // Calendar state
  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(today.getFullYear(), today.getMonth(), diff);
    monday.setHours(0, 0, 0, 0);
    return monday;
  });

  const gridRef = useRef(null);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [schedulesResponse, trainsResponse] = await Promise.all([
        schedulesApi.getAll(),
        trainsApi.getAll()
      ]);

      let schedulesData = [];
      if (schedulesResponse) {
        if (Array.isArray(schedulesResponse)) {
          schedulesData = schedulesResponse;
        } else if (schedulesResponse.schedules && Array.isArray(schedulesResponse.schedules)) {
          schedulesData = schedulesResponse.schedules;
        } else if (schedulesResponse.data) {
          if (Array.isArray(schedulesResponse.data)) {
            schedulesData = schedulesResponse.data;
          } else if (schedulesResponse.data.schedules && Array.isArray(schedulesResponse.data.schedules)) {
            schedulesData = schedulesResponse.data.schedules;
          }
        }
      }

      let trainsData = [];
      if (trainsResponse) {
        if (Array.isArray(trainsResponse)) {
          trainsData = trainsResponse;
        } else if (trainsResponse.trains && Array.isArray(trainsResponse.trains)) {
          trainsData = trainsResponse.trains;
        } else if (trainsResponse.data) {
          if (Array.isArray(trainsResponse.data)) {
            trainsData = trainsResponse.data;
          } else if (trainsResponse.data.trains && Array.isArray(trainsResponse.data.trains)) {
            trainsData = trainsResponse.data.trains;
          }
        }
      }

      setSchedules(schedulesData);
      setTrains(trainsData);
    } catch (err) {
      const errorMessage = err.detail || err.message || 'ဒေတာများ ရယူ၍မရပါ။ ထပ်မံကြိုးစားကြည့်ပါ။';
      setError(errorMessage);
      setSchedules([]);
      setTrains([]);
    } finally {
      setLoading(false);
    }
  };

  // 🆕 Check if schedule is editable
  const isScheduleEditable = (status) => {
    return ['SCHEDULED', 'DELAYED', 'CANCELLED'].includes(status);
  };

  // 🆕 Check if schedule is deletable
  const isScheduleDeletable = (status) => {
    return ['SCHEDULED', 'DELAYED', 'CANCELLED'].includes(status);
  };

  // 🆕 Get lock reason
  const getLockReason = (status) => {
    if (status === 'ACTIVE') return 'ရထားပြေးဆွဲနေစဉ် ပြင်ဆင်၍မရပါ';
    if (status === 'COMPLETED') return 'ပြီးဆုံးသွားသော အချိန်ဇယားကို ပြင်ဆင်၍မရပါ';
    return null;
  };

  const timeToMinutes = (timeStr) => {
    if (!timeStr) return 0;
    const [hours, minutes] = timeStr.split(':').map(Number);
    return (hours * 60) + (minutes || 0);
  };

  const minutesTo12Hour = (minutes) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${mins.toString().padStart(2, '0')} ${period}`;
  };

  const timeSlots = useMemo(() => {
    const slots = [];
    for (let i = 0; i < 48; i++) {
      slots.push(i * 30);
    }
    return slots;
  }, []);

  const calculateSchedulePosition = (schedule) => {
    const departureTime = schedule.departure_time;
    const arrivalTime = schedule.arrival_time;
    const isOvernight = schedule.is_overnight || false;
    const isArrivalPart = schedule._isArrivalPart || false;

    const startMinutes = timeToMinutes(departureTime);
    let endMinutes = timeToMinutes(arrivalTime);

    if (!arrivalTime || endMinutes <= startMinutes) {
      endMinutes = startMinutes + 60;
    }

    if (isOvernight && isArrivalPart) {
      const topPosition = 0;
      const height = (endMinutes / 30) * 40;
      return { top: topPosition, height: Math.max(height, 30), duration: endMinutes, startMinutes: 0, endMinutes, isOvernight: true, isArrivalPart: true };
    } else if (isOvernight) {
      endMinutes = 1440;
      const topPosition = (startMinutes / 30) * 40;
      const height = ((1440 - startMinutes) / 30) * 40;
      return { top: topPosition, height: Math.max(height, 30), duration: 1440 - startMinutes, startMinutes, endMinutes: 1440, isOvernight: true, isArrivalPart: false };
    } else {
      const topPosition = (startMinutes / 30) * 40;
      const height = ((endMinutes - startMinutes) / 30) * 40;
      return { top: topPosition, height: Math.max(height, 30), duration: endMinutes - startMinutes, startMinutes, endMinutes, isOvernight: false, isArrivalPart: false };
    }
  };

  const assignLanes = (daySchedules) => {
    if (!daySchedules || daySchedules.length === 0) return { lanes: new Map(), totalLanes: 0 };

    const scheduleParts = daySchedules.map(schedule => {
      const pos = calculateSchedulePosition(schedule);
      const key = schedule._isArrivalPart ? `${schedule.id}_arrival` : `${schedule.id}_departure`;
      return { key, startMinutes: pos.startMinutes, endMinutes: pos.endMinutes, schedule };
    });

    scheduleParts.sort((a, b) => a.startMinutes - b.startMinutes);

    const lanes = new Map();
    const laneEndTimes = [];

    scheduleParts.forEach(part => {
      let assignedLane = 0;
      while (assignedLane < laneEndTimes.length) {
        if (laneEndTimes[assignedLane] <= part.startMinutes) break;
        assignedLane++;
      }
      lanes.set(part.key, assignedLane);
      laneEndTimes[assignedLane] = part.endMinutes;
    });

    return { lanes, totalLanes: laneEndTimes.length };
  };

  const weekDays = useMemo(() => {
    const days = [];
    const dayNames = ['တနင်္လာ', 'အင်္ဂါ', 'ဗုဒ္ဓဟူး', 'ကြာသပတေး', 'သောကြာ', 'စနေ', 'တနင်္ဂနွေ'];

    for (let i = 0; i < 7; i++) {
      const date = new Date(currentWeekStart);
      date.setDate(currentWeekStart.getDate() + i);

      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;

      days.push({
        date: date,
        dayName: dayNames[i],
        dateStr: dateStr,
        displayDate: date.toLocaleDateString('my-MM', { day: 'numeric', month: 'short' })
      });
    }
    return days;
  }, [currentWeekStart]);

  const schedulesByDate = useMemo(() => {
    const grouped = {};
    if (!Array.isArray(schedules)) return grouped;

    schedules.forEach(schedule => {
      if (!schedule || !schedule.departure_date) return;

      const departureDateStr = schedule.departure_date.split('T')[0];
      if (!grouped[departureDateStr]) grouped[departureDateStr] = [];
      grouped[departureDateStr].push({ ...schedule, _isArrivalPart: false });

      if (schedule.is_overnight && schedule.arrival_date) {
        const arrivalDateStr = schedule.arrival_date.split('T')[0];
        if (arrivalDateStr !== departureDateStr) {
          if (!grouped[arrivalDateStr]) grouped[arrivalDateStr] = [];
          const alreadyExists = grouped[arrivalDateStr].some(s => s.id === schedule.id && s._isArrivalPart);
          if (!alreadyExists) {
            grouped[arrivalDateStr].push({ ...schedule, _isArrivalPart: true });
          }
        }
      }
    });

    return grouped;
  }, [schedules]);

  const filteredSchedules = useMemo(() => {
    if (!Array.isArray(schedules)) return [];
    if (!searchTerm.trim()) return schedules;

    const searchLower = searchTerm.toLowerCase();
    return schedules.filter(schedule => {
      if (!schedule) return false;
      const trainNo = (schedule.train?.train_no || '').toLowerCase();
      const trainName = (schedule.train?.train_name || '').toLowerCase();
      const status = (schedule.status || '').toLowerCase();
      return trainNo.includes(searchLower) || trainName.includes(searchLower) || status.includes(searchLower);
    });
  }, [schedules, searchTerm]);

  const navigateWeek = (direction) => {
    const newDate = new Date(currentWeekStart);
    newDate.setDate(currentWeekStart.getDate() + (direction * 7));
    setCurrentWeekStart(newDate);
  };

  const goToCurrentWeek = () => {
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(today.getFullYear(), today.getMonth(), diff);
    monday.setHours(0, 0, 0, 0);
    setCurrentWeekStart(monday);
  };

  const handleCreate = async (formData) => {
    setActionLoading(true);
    try {
      if (Array.isArray(formData) && formData.length > 1) {
        const response = await schedulesApi.bulkCreate({ schedules: formData });
        if (response.failed && response.failed > 0) {
          setToast({ type: 'warning', message: `အချိန်ဇယား ${response.created || 0} ခု အောင်မြင်စွာ ထည့်သွင်းပြီး ${response.failed} ခု မအောင်မြင်ပါ။` });
        } else {
          setToast({ type: 'success', message: `အချိန်ဇယား ${response.created || formData.length} ခု အောင်မြင်စွာ ထည့်သွင်းပြီးပါပြီ။` });
        }
      } else {
        const singleData = Array.isArray(formData) ? formData[0] : formData;
        await schedulesApi.create(singleData);
        setToast({ type: 'success', message: 'အချိန်ဇယား အောင်မြင်စွာ ထည့်သွင်းပြီးပါပြီ။' });
      }
      await fetchData();
      setError(null);
    } catch (err) {
      const errorMessage = err.detail || err.message || 'အချိန်ဇယား ထည့်သွင်း၍မရပါ';
      setError(errorMessage);
      setToast({ type: 'error', message: errorMessage });
      throw err;
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdate = async (formData) => {
    if (!selectedSchedule) return;

    // 🆕 Check if schedule is editable
    if (!isScheduleEditable(selectedSchedule.status)) {
      const reason = getLockReason(selectedSchedule.status);
      setToast({ type: 'error', message: reason });
      throw new Error(reason);
    }

    const data = Array.isArray(formData) ? formData[0] : formData;

    setActionLoading(true);
    try {
      const updateData = {};

      if (data.train_id && parseInt(data.train_id) !== selectedSchedule.train_id) {
        updateData.train_id = parseInt(data.train_id);
      }
      if (data.departure_date) {
        const dateStr = data.departure_date instanceof Date ? data.departure_date.toISOString().split('T')[0] : data.departure_date.split('T')[0];
        if (dateStr !== selectedSchedule.departure_date.split('T')[0]) {
          updateData.departure_date = dateStr;
        }
      }
      if (data.departure_time && data.departure_time !== selectedSchedule.departure_time) {
        updateData.departure_time = data.departure_time;
      }
      if (data.arrival_time && data.arrival_time !== selectedSchedule.arrival_time) {
        updateData.arrival_time = data.arrival_time;
      }
      if (data.status && data.status !== selectedSchedule.status) {
        updateData.status = data.status;
      }
      if (data.hasOwnProperty('is_overnight')) {
        updateData.is_overnight = data.is_overnight;
      }
      if (data.arrival_date) {
        const arrivalDateStr = data.arrival_date instanceof Date ? data.arrival_date.toISOString().split('T')[0] : data.arrival_date.split('T')[0];
        updateData.arrival_date = arrivalDateStr;
      }

      if (Object.keys(updateData).length === 0) {
        setToast({ type: 'warning', message: 'ပြောင်းလဲမှုမရှိပါ' });
        setActionLoading(false);
        return;
      }

      await schedulesApi.update(selectedSchedule.id, updateData);
      await fetchData();
      setError(null);
      setToast({ type: 'success', message: 'အချိန်ဇယား အောင်မြင်စွာ ပြင်ဆင်ပြီးပါပြီ။' });
    } catch (err) {
      const errorMessage = err.detail || err.message || 'အချိန်ဇယား ပြင်ဆင်၍မရပါ';
      setError(errorMessage);
      setToast({ type: 'error', message: errorMessage });
      throw err;
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;

    // 🆕 Check if schedule is deletable
    const schedule = schedules.find(s => s.id === deleteId);
    if (schedule && !isScheduleDeletable(schedule.status)) {
      const reason = getLockReason(schedule.status);
      setToast({ type: 'error', message: reason });
      setIsDeleteDialogOpen(false);
      setDeleteId(null);
      return;
    }

    setActionLoading(true);
    try {
      await schedulesApi.delete(deleteId);
      setSchedules(prev => Array.isArray(prev) ? prev.filter(s => s.id !== deleteId) : []);
      setIsDeleteDialogOpen(false);
      setDeleteId(null);
      setError(null);
      setToast({ type: 'success', message: 'အချိန်ဇယား အောင်မြင်စွာ ဖျက်သိမ်းပြီးပါပြီ။' });
    } catch (err) {
      const errorMessage = err.detail || err.message || 'ဖျက်သိမ်း၍မရပါ';
      setError(errorMessage);
      setToast({ type: 'error', message: errorMessage });
      setIsDeleteDialogOpen(false);
      setDeleteId(null);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteFromForm = async (id) => {
    // 🆕 Check if schedule is deletable
    const schedule = schedules.find(s => s.id === id);
    if (schedule && !isScheduleDeletable(schedule.status)) {
      const reason = getLockReason(schedule.status);
      setToast({ type: 'error', message: reason });
      throw new Error(reason);
    }

    setActionLoading(true);
    try {
      await schedulesApi.delete(id);
      setSchedules(prev => Array.isArray(prev) ? prev.filter(s => s.id !== id) : []);
      setIsFormOpen(false);
      setSelectedSchedule(null);
      setError(null);
      setToast({ type: 'success', message: 'အချိန်ဇယား အောင်မြင်စွာ ဖျက်သိမ်းပြီးပါပြီ။' });
    } catch (err) {
      const errorMessage = err.detail || err.message || 'ဖျက်သိမ်း၍မရပါ';
      setError(errorMessage);
      setToast({ type: 'error', message: errorMessage });
      throw err;
    } finally {
      setActionLoading(false);
    }
  };

  const handleEditClick = (schedule) => {
    // 🆕 Check if schedule is editable
    if (!isScheduleEditable(schedule.status)) {
      const reason = getLockReason(schedule.status);
      setToast({ type: 'warning', message: reason });
      return;
    }

    const originalSchedule = schedules.find(s => s.id === schedule.id);
    setSelectedSchedule(originalSchedule || schedule);
    setIsFormOpen(true);
  };

  const handleDeleteClick = (id, e) => {
    if (e) e.stopPropagation();

    // 🆕 Check if schedule is deletable
    const schedule = schedules.find(s => s.id === id);
    if (schedule && !isScheduleDeletable(schedule.status)) {
      const reason = getLockReason(schedule.status);
      setToast({ type: 'warning', message: reason });
      return;
    }

    setDeleteId(id);
    setIsDeleteDialogOpen(true);
  };

  const handleAddClick = () => {
    setSelectedSchedule(null);
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setSelectedSchedule(null);
  };

  const handleFormSubmit = async (formData) => {
    try {
      if (selectedSchedule) {
        await handleUpdate(formData);
      } else {
        await handleCreate(formData);
      }
    } catch (err) {
      console.error("Form submission error:", err);
      throw err;
    }
  };

  const getStatusStyles = (status) => {
    const styles = {
      SCHEDULED: { bg: 'bg-blue-500', border: 'border-blue-600', bgLight: 'bg-blue-50', bgHover: 'hover:bg-blue-600', text: 'text-white', dot: 'bg-blue-400' },
      ACTIVE: { bg: 'bg-green-500', border: 'border-green-600', bgLight: 'bg-green-50', bgHover: 'hover:bg-green-600', text: 'text-white', dot: 'bg-green-400' },
      COMPLETED: { bg: 'bg-gray-400', border: 'border-gray-500', bgLight: 'bg-gray-50', bgHover: 'hover:bg-gray-500', text: 'text-white', dot: 'bg-gray-300' },
      CANCELLED: { bg: 'bg-red-500', border: 'border-red-600', bgLight: 'bg-red-50', bgHover: 'hover:bg-red-600', text: 'text-white', dot: 'bg-red-400' },
      DELAYED: { bg: 'bg-yellow-500', border: 'border-yellow-600', bgLight: 'bg-yellow-50', bgHover: 'hover:bg-yellow-600', text: 'text-white', dot: 'bg-yellow-400' }
    };
    return styles[status] || styles.SCHEDULED;
  };

  const getStatusText = (status) => {
    const texts = {
      SCHEDULED: 'စီစဉ်ထားသည်', ACTIVE: 'လက်ရှိပြေးဆွဲနေသည်', COMPLETED: 'ပြီးစီးသည်',
      CANCELLED: 'ဖျက်သိမ်းသည်', DELAYED: 'နှောင့်နှေးသည်'
    };
    return texts[status] || status || 'မသိ';
  };

  const formatDuration = (minutes) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 0) return `${mins}မိနစ်`;
    if (mins === 0) return `${hours}နာရီ`;
    return `${hours}နာရီ ${mins}မိနစ်`;
  };

  const ScheduleBlock = ({ schedule, lane, totalLanes }) => {
    const styles = getStatusStyles(schedule.status);
    const position = calculateSchedulePosition(schedule);
    const isOvernight = schedule.is_overnight || false;
    const isArrivalPart = schedule._isArrivalPart || false;
    const isLocked = !isScheduleEditable(schedule.status);

    const width = totalLanes > 0 ? `${(100 / totalLanes) - 2}%` : '98%';
    const left = totalLanes > 0 ? `${(lane * 100) / totalLanes + 1}%` : '1%';

    const isActive = schedule.status === 'ACTIVE' && !isArrivalPart;
    const isDelayed = schedule.status === 'DELAYED' && !isArrivalPart;

    return (
      <div
        className={`
          absolute ${styles.bg} ${styles.text}
          rounded-md cursor-pointer
          transition-all duration-200
          hover:shadow-lg hover:z-10
          ${isActive ? 'animate-pulse ring-2 ring-green-300' : ''}
          ${isDelayed ? 'animate-pulse ring-2 ring-yellow-300' : ''}
          ${isOvernight && !isArrivalPart ? 'border-r-4 border-r-indigo-300' : ''}
          ${isArrivalPart ? 'border-l-4 border-l-indigo-300 opacity-90' : ''}
          ${isLocked ? 'opacity-75' : ''}
          overflow-hidden
        `}
        style={{
          top: `${position.top}px`,
          height: `${position.height}px`,
          width: width,
          left: left,
          minHeight: '30px'
        }}
        onClick={() => handleEditClick(schedule)}
        title={`${schedule.train?.train_no || ''} - ${getStatusText(schedule.status)}${isOvernight ? ' (Overnight)' : ''}${isArrivalPart ? ' (Arrival)' : ''}${isLocked ? ' - ပြင်ဆင်၍မရပါ' : ''}\n${formatDuration(position.duration)}`}
      >
        <div className="p-1.5 h-full flex flex-col justify-center relative">
          {isLocked && (
            <Lock className="absolute top-1 right-1 w-3 h-3 opacity-70" />
          )}
          {isArrivalPart ? (
            <>
              <div className="flex items-center gap-1 mb-0.5">
                <Moon className="w-3 h-3 text-indigo-200 flex-shrink-0" />
                <span className="font-bold text-xs truncate">{schedule.train?.train_no || `#${schedule.train_id}`}</span>
              </div>
              {position.height >= 40 && (
                <div className="text-[10px] font-medium mt-auto text-indigo-100">
                  ဆိုက်ရောက်: {schedule.arrival_time ? minutesTo12Hour(timeToMinutes(schedule.arrival_time)) : '--:--'}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="flex items-center gap-1 mb-0.5">
                <div className={`w-1.5 h-1.5 rounded-full ${styles.dot} flex-shrink-0`}></div>
                <span className="font-bold text-xs truncate">{schedule.train?.train_no || `#${schedule.train_id}`}</span>
                {isOvernight && <Moon className="w-3 h-3 text-indigo-200 flex-shrink-0" />}
              </div>
              {position.height >= 50 && <div className="text-[10px] opacity-90 truncate">{schedule.train?.train_name}</div>}
              <div className="text-[10px] font-medium mt-auto">
                {schedule.departure_time ? minutesTo12Hour(timeToMinutes(schedule.departure_time)) : '--:--'}
                {schedule.arrival_time && <> → {isOvernight ? <span className="text-indigo-200">{minutesTo12Hour(timeToMinutes(schedule.arrival_time))} (နောက်နေ့)</span> : minutesTo12Hour(timeToMinutes(schedule.arrival_time))}</>}
              </div>
              {position.height >= 60 && schedule.train?.route && (
                <div className="text-[9px] opacity-75 truncate mt-0.5">{schedule.train.route.origin} → {schedule.train.route.destination}</div>
              )}
            </>
          )}
        </div>
      </div>
    );
  };

  const ToastComponent = ({ toast }) => {
    if (!toast) return null;
    const bgColors = {
      success: 'bg-green-50 border-green-200 text-green-700',
      error: 'bg-red-50 border-red-200 text-red-700',
      warning: 'bg-yellow-50 border-yellow-200 text-yellow-700'
    };
    const message = typeof toast.message === 'string' ? toast.message : JSON.stringify(toast.message);
    return (
      <div className={`fixed bottom-4 right-4 p-4 rounded-xl border shadow-lg z-50 max-w-md ${bgColors[toast.type]}`}>
        <div className="flex items-start gap-3">
          <div className="flex-1"><p className="text-sm font-medium">{message}</p></div>
          <button onClick={() => setToast(null)} className="text-gray-500 hover:text-gray-700">✕</button>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">ဒေတာများ ရယူနေသည်...</p>
        </div>
      </div>
    );
  }

  const weekStartStr = currentWeekStart.toLocaleDateString('my-MM', { month: 'long', day: 'numeric' });
  const weekEnd = new Date(currentWeekStart);
  weekEnd.setDate(currentWeekStart.getDate() + 6);
  const weekEndStr = weekEnd.toLocaleDateString('my-MM', { month: 'long', day: 'numeric', year: 'numeric' });

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const currentTimePosition = (currentMinutes / 30) * 40;

  return (
    <div className="space-y-4">
      <ToastComponent toast={toast} />

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">အချိန်ဇယားများ စီမံခန့်ခွဲခြင်း</h1>
          <p className="text-gray-600 mt-1">ရထားခရီးစဉ်အချိန်ဇယားများအား အပတ်စဉ်ကြည့်ရှုရန်</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={goToCurrentWeek} className="bg-gray-100 hover:bg-gray-200 text-gray-700">ယနေ့</Button>
          <Button onClick={handleAddClick} className="bg-blue-600 hover:bg-blue-700 text-white">
            <Plus className="w-4 h-4" />အချိန်ဇယားအသစ်
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center space-x-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
          <p className="text-red-700 text-sm flex-1">{error}</p>
          <button onClick={() => setError(null)} className="text-red-600 hover:text-red-800 transition-colors">✕</button>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-4 items-center">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input type="text" placeholder="ရှာဖွေပါ..." className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        </div>
        <div className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 px-4 py-2">
          <button onClick={() => navigateWeek(-1)} className="p-1 hover:bg-gray-100 rounded-lg"><ChevronLeft className="w-5 h-5 text-gray-600" /></button>
          <span className="text-sm font-medium text-gray-700 min-w-[200px] text-center">{weekStartStr} - {weekEndStr}</span>
          <button onClick={() => navigateWeek(1)} className="p-1 hover:bg-gray-100 rounded-lg"><ChevronRight className="w-5 h-5 text-gray-600" /></button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 p-3 bg-white rounded-xl border border-gray-200">
        {['ACTIVE', 'SCHEDULED', 'DELAYED', 'COMPLETED', 'CANCELLED'].map(status => {
          const styles = getStatusStyles(status);
          return <div key={status} className="flex items-center gap-2"><div className={`w-4 h-4 rounded ${styles.bg}`}></div><span className="text-xs text-gray-600">{getStatusText(status)}</span></div>;
        })}
        <div className="flex items-center gap-2">
          <div className="flex"><div className="w-2 h-4 rounded-l bg-gray-400 border-r-2 border-indigo-300"></div><div className="w-2 h-4 rounded-r bg-gray-400 border-l-2 border-indigo-300"></div></div>
          <span className="text-xs text-gray-600">ညဖြတ်သန်း</span>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="grid grid-cols-[80px_repeat(7,1fr)] border-b border-gray-200 bg-gray-50 sticky top-0 z-20">
          <div className="p-3 border-r border-gray-200 text-center"><Clock className="w-4 h-4 text-gray-400 mx-auto" /></div>
          {weekDays.map((day, index) => {
            const isToday = day.date.toDateString() === new Date().toDateString();
            return (
              <div key={index} className={`p-3 border-r border-gray-200 last:border-r-0 text-center ${isToday ? 'bg-blue-50' : ''}`}>
                <div className={`text-xs font-medium ${isToday ? 'text-blue-600' : 'text-gray-500'}`}>{day.dayName}</div>
                <div className={`text-lg font-bold ${isToday ? 'text-blue-600' : 'text-gray-900'}`}>{day.date.getDate()}</div>
                <div className={`text-xs ${isToday ? 'text-blue-500' : 'text-gray-400'}`}>{day.date.toLocaleDateString('my-MM', { month: 'short' })}</div>
              </div>
            );
          })}
        </div>

        <div className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 300px)' }} ref={gridRef}>
          <div className="grid grid-cols-[80px_repeat(7,1fr)] relative">
            <div className="border-r border-gray-200">
              {timeSlots.map((minutes, index) => (
                <div key={minutes} className="h-[40px] flex items-center justify-end pr-3 border-b border-gray-100">
                  <span className="text-xs font-medium text-gray-500">{index % 2 === 0 ? minutesTo12Hour(minutes) : ''}</span>
                </div>
              ))}
            </div>

            {weekDays.map((day, dayIndex) => {
              const dateStr = day.dateStr;
              const daySchedules = schedulesByDate[dateStr] || [];
              const isToday = day.date.toDateString() === new Date().toDateString();
              const { lanes, totalLanes } = assignLanes(daySchedules);

              return (
                <div key={dayIndex} className={`relative border-r border-gray-200 last:border-r-0 ${isToday ? 'bg-blue-50/20' : ''}`}
                  style={{ height: `${timeSlots.length * 40}px` }}>
                  {timeSlots.map((minutes, index) => (
                    <div key={minutes} className={`h-[40px] border-b ${index % 2 === 0 ? 'border-gray-200' : 'border-gray-100'}`} />
                  ))}
                  {isToday && currentMinutes >= 0 && currentMinutes <= 1440 && (
                    <div className="absolute left-0 right-0 z-20 pointer-events-none" style={{ top: `${currentTimePosition}px` }}>
                      <div className="flex items-center"><div className="w-2 h-2 rounded-full bg-red-500 -ml-1"></div><div className="flex-1 border-t-2 border-red-500"></div></div>
                    </div>
                  )}
                  {daySchedules.map((schedule) => {
                    const isArrivalPart = schedule._isArrivalPart || false;
                    const laneKey = `${schedule.id}_${isArrivalPart ? 'arrival' : 'departure'}`;
                    return <ScheduleBlock key={laneKey} schedule={schedule} lane={lanes.get(laneKey) || 0} totalLanes={totalLanes} />;
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="text-sm text-gray-600 text-center">
        စုစုပေါင်း {filteredSchedules.length} ခု တွေ့ရှိပါသည်{searchTerm && ` (ရှာဖွေမှု: "${searchTerm}")`}
      </div>

      <ScheduleFormModal
        isOpen={isFormOpen}
        onClose={handleCloseForm}
        onSubmit={handleFormSubmit}
        schedule={selectedSchedule}
        trains={trains}
        onDelete={handleDeleteFromForm}
      />

      <ConfirmDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => { setIsDeleteDialogOpen(false); setDeleteId(null); }}
        onConfirm={handleDelete}
        title="အချိန်ဇယားဖျက်သိမ်းမည်"
        message="ဤအချိန်ဇယားအား ဖျက်သိမ်းလိုသည်မှာ သေချာပါသလား? ဤလုပ်ဆောင်ချက်ကို ပြန်လည်ရုပ်သိမ်း၍မရပါ။"
      />

      {actionLoading && (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-xl p-6 shadow-xl">
            <Loader className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-3" />
            <p className="text-gray-700">လုပ်ဆောင်နေသည်...</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default SchedulesManagement;
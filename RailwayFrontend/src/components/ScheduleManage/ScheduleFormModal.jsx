// components/ScheduleFormModal.jsx
import React, { useState, useEffect } from 'react';
import { 
  X, Calendar, Clock, Repeat, AlertCircle, Trash2, Moon, 
  User, UserCheck, Users, ChevronDown, Loader
} from 'lucide-react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import Button from '@/components/ui/button';
import ScrollableTimePicker from '@/components/ui/ScrollableTimePicker';
import api from '@/api/axios';

const ScheduleFormModal = ({ isOpen, onClose, onSubmit, schedule, trains, onDelete }) => {
  const [formData, setFormData] = useState({
    train_id: '',
    departure_date: null,
    departure_time: '08:00',
    arrival_time: '18:00',
    status: 'SCHEDULED',
    repeat_mode: 'SINGLE',
    repeat_end_date: null,
    selectedDays: [],
    repeat_interval: 1,
    is_overnight: false,
    arrival_date: null,
    // Staff assignment
    driver_id: '',
    assistant_driver_id: '',
    guard_id: '',
    ticket_checker_ids: [],
  });
  
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [generatedSchedules, setGeneratedSchedules] = useState([]);
  const [showPreview, setShowPreview] = useState(false);
  const [showDeletePopup, setShowDeletePopup] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  
  // Staff lists
  const [availableDrivers, setAvailableDrivers] = useState([]);
  const [availableAssistants, setAvailableAssistants] = useState([]);
  const [availableGuards, setAvailableGuards] = useState([]);
  const [availableTicketCheckers, setAvailableTicketCheckers] = useState([]);
  const [loadingStaff, setLoadingStaff] = useState(false);

  const daysOfWeek = [
    { value: 0, label: 'တနင်္ဂနွေ' },
    { value: 1, label: 'တနင်္လာ' },
    { value: 2, label: 'အင်္ဂါ' },
    { value: 3, label: 'ဗုဒ္ဓဟူး' },
    { value: 4, label: 'ကြာသပတေး' },
    { value: 5, label: 'သောကြာ' },
    { value: 6, label: 'စနေ' }
  ];

  // Helper: Format date as YYYY-MM-DD without timezone issues
  const formatDateStr = (date) => {
    if (!date) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Helper: Add days to a date
  const addDays = (date, days) => {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  };

  // Fetch available staff when train or date changes
  useEffect(() => {
    if (formData.train_id && formData.departure_date && isOpen) {
      fetchAvailableStaff();
    }
  }, [formData.train_id, formData.departure_date, isOpen]);

  const fetchAvailableStaff = async () => {
      if (!formData.train_id) return;
      
      setLoadingStaff(true);
      try {
          const params = {
              assignment_date: formatDateStr(formData.departure_date)
          };
          
          // Add time parameters for better conflict detection
          if (formData.departure_time) {
              params.departure_time = formData.departure_time;
          }
          if (formData.arrival_time) {
              params.arrival_time = formData.arrival_time;
          }
          if (formData.is_overnight) {
              params.is_overnight = true;
          }
          
          const response = await api.get(`/staff/available-for-train/${formData.train_id}`, {
              params
          });
          
          const allStaff = response.data || [];
          
          // Filter by role
          setAvailableDrivers(allStaff.filter(s => s.role === 'TRAIN_DRIVER'));
          setAvailableAssistants(allStaff.filter(s => s.role === 'ASSISTANT_DRIVER'));
          setAvailableGuards(allStaff.filter(s => s.role === 'TRAIN_GUARD'));
          setAvailableTicketCheckers(allStaff.filter(s => s.role === 'TICKET_CHECKER'));
      } catch (err) {
          console.error('Failed to fetch staff:', err);
      } finally {
          setLoadingStaff(false);
      }
  };

  useEffect(() => {
    if (schedule) {
      // EDIT MODE
      const departureDate = schedule.departure_date 
        ? new Date(schedule.departure_date + 'T00:00:00') 
        : null;
      
      const arrivalDate = schedule.arrival_date 
        ? new Date(schedule.arrival_date + 'T00:00:00') 
        : null;
      
      setFormData({
        train_id: schedule.train_id || '',
        departure_date: departureDate,
        departure_time: schedule.departure_time || '08:00',
        arrival_time: schedule.arrival_time || '18:00',
        status: schedule.status || 'SCHEDULED',
        repeat_mode: 'SINGLE',
        repeat_end_date: null,
        selectedDays: [],
        repeat_interval: 1,
        is_overnight: schedule.is_overnight || false,
        arrival_date: arrivalDate,
        driver_id: schedule.driver_id || '',
        assistant_driver_id: schedule.assistant_driver_id || '',
        guard_id: schedule.guard_id || '',
        ticket_checker_ids: schedule.ticket_checker_ids || [],
      });
    } else {
      // CREATE MODE
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      setFormData({
        train_id: '',
        departure_date: tomorrow,
        departure_time: '08:00',
        arrival_time: '18:00',
        status: 'SCHEDULED',
        repeat_mode: 'SINGLE',
        repeat_end_date: null,
        selectedDays: [],
        repeat_interval: 1,
        is_overnight: false,
        arrival_date: null,
        driver_id: '',
        assistant_driver_id: '',
        guard_id: '',
        ticket_checker_ids: [],
      });
    }
    setErrors({});
    setGeneratedSchedules([]);
    setShowPreview(false);
    setShowDeletePopup(false);
    setDeleteLoading(false);
  }, [schedule, isOpen]);

  // When is_overnight changes, auto-set arrival_date
  useEffect(() => {
    if (formData.is_overnight && formData.departure_date && !formData.arrival_date) {
      const nextDay = addDays(formData.departure_date, 1);
      setFormData(prev => ({ ...prev, arrival_date: nextDay }));
    }
    if (!formData.is_overnight) {
      setFormData(prev => ({ ...prev, arrival_date: null }));
    }
  }, [formData.is_overnight]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
    setGeneratedSchedules([]);
    setShowPreview(false);
  };

  const handleDateChange = (date, field = 'departure_date') => {
    if (date) {
      date.setHours(0, 0, 0, 0);
    }
    setFormData(prev => {
      const updated = { ...prev, [field]: date };
      
      if (field === 'departure_date' && prev.is_overnight) {
        updated.arrival_date = addDays(date, 1);
      }
      
      return updated;
    });
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }));
    setGeneratedSchedules([]);
    setShowPreview(false);
  };

  const handleTimeChange = (field, timeValue) => {
    setFormData(prev => ({ ...prev, [field]: timeValue }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }));
    setGeneratedSchedules([]);
    setShowPreview(false);
  };

  const handleDayToggle = (day) => {
    setFormData(prev => {
      const selectedDays = prev.selectedDays.includes(day)
        ? prev.selectedDays.filter(d => d !== day)
        : [...prev.selectedDays, day].sort((a, b) => a - b);
      return { ...prev, selectedDays };
    });
    setGeneratedSchedules([]);
    setShowPreview(false);
  };

  // Handle ticket checker multi-select
  const handleTicketCheckerToggle = (staffId) => {
    setFormData(prev => {
      const current = prev.ticket_checker_ids || [];
      const updated = current.includes(staffId)
        ? current.filter(id => id !== staffId)
        : [...current, staffId];
      return { ...prev, ticket_checker_ids: updated };
    });
  };

  // Generate all schedule dates based on repeat mode
  const generateRecurringSchedules = () => {
    const startDate = formData.departure_date;
    const endDate = formData.repeat_end_date;

    if (!startDate || !endDate) return [];

    const startDateOnly = new Date(startDate);
    startDateOnly.setHours(0, 0, 0, 0);
    
    const endDateOnly = new Date(endDate);
    endDateOnly.setHours(23, 59, 59, 999);

    const scheduleDates = [];

    switch (formData.repeat_mode) {
      case 'DAILY': {
        const currentDate = new Date(startDateOnly);
        while (currentDate <= endDateOnly) {
          scheduleDates.push(new Date(currentDate));
          currentDate.setDate(currentDate.getDate() + formData.repeat_interval);
        }
        break;
      }

      case 'WEEKLY': {
        const selectedDays = formData.selectedDays;
        if (selectedDays.length === 0) return [];

        const startOfWeek = new Date(startDateOnly);
        const dayOfWeek = startOfWeek.getDay();
        startOfWeek.setDate(startOfWeek.getDate() - dayOfWeek);

        const currentWeekStart = new Date(startOfWeek);
        
        while (currentWeekStart <= endDateOnly) {
          selectedDays.forEach(day => {
            const scheduleDate = new Date(currentWeekStart);
            scheduleDate.setDate(currentWeekStart.getDate() + day);
            scheduleDate.setHours(0, 0, 0, 0);
            
            if (scheduleDate >= startDateOnly && scheduleDate <= endDateOnly) {
              scheduleDates.push(new Date(scheduleDate));
            }
          });

          currentWeekStart.setDate(currentWeekStart.getDate() + (7 * formData.repeat_interval));
        }
        break;
      }

      case 'MONTHLY': {
        const selectedDays = formData.selectedDays;
        if (selectedDays.length === 0) return [];

        const startMonth = new Date(startDateOnly.getFullYear(), startDateOnly.getMonth(), 1);
        const currentMonth = new Date(startMonth);
        
        while (currentMonth <= endDateOnly) {
          const year = currentMonth.getFullYear();
          const month = currentMonth.getMonth();
          const daysInMonth = new Date(year, month + 1, 0).getDate();
          
          selectedDays.forEach(day => {
            if (day >= 1 && day <= daysInMonth) {
              const scheduleDate = new Date(year, month, day);
              scheduleDate.setHours(0, 0, 0, 0);
              
              if (scheduleDate >= startDateOnly && scheduleDate <= endDateOnly) {
                scheduleDates.push(new Date(scheduleDate));
              }
            }
          });

          currentMonth.setMonth(currentMonth.getMonth() + formData.repeat_interval);
        }
        break;
      }

      default:
        return [];
    }

    return scheduleDates.sort((a, b) => a - b);
  };

  const previewSchedules = () => {
    const schedules = generateRecurringSchedules();
    setGeneratedSchedules(schedules);
    setShowPreview(true);
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formData.train_id) newErrors.train_id = 'Please select a train';
    if (!formData.departure_date) newErrors.departure_date = 'Please select departure date';
    if (!formData.departure_time) newErrors.departure_time = 'Please select departure time';
    if (!formData.arrival_time) newErrors.arrival_time = 'Please select arrival time';

    if (formData.is_overnight && !formData.arrival_date) {
      newErrors.arrival_date = 'Please select arrival date for overnight schedule';
    }

    if (!schedule && formData.repeat_mode !== 'SINGLE') {
      if (!formData.repeat_end_date) {
        newErrors.repeat_end_date = 'Please select end date for repetition';
      } else if (formData.repeat_end_date < formData.departure_date) {
        newErrors.repeat_end_date = 'End date must be on or after start date';
      }
      
      if (formData.repeat_mode !== 'DAILY' && formData.selectedDays.length === 0) {
        newErrors.selectedDays = 'Please select at least one day';
      }

      if (formData.repeat_interval < 1) {
        newErrors.repeat_interval = 'Interval must be at least 1';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setLoading(true);
    try {
      if (schedule) {
        // EDIT MODE
        const updateData = {
          train_id: parseInt(formData.train_id),
          departure_date: formatDateStr(formData.departure_date),
          departure_time: formData.departure_time,
          arrival_time: formData.arrival_time,
          status: formData.status,
          is_overnight: formData.is_overnight || false,
          arrival_date: formData.is_overnight ? formatDateStr(formData.arrival_date) : null,
          driver_id: formData.driver_id || null,
          assistant_driver_id: formData.assistant_driver_id || null,
          guard_id: formData.guard_id || null,
          ticket_checker_ids: formData.ticket_checker_ids || [],
        };
        
        await onSubmit(updateData);
        onClose();
        return;
      }

      // CREATE MODE
      let schedulesToCreate = [];

      if (formData.repeat_mode === 'SINGLE') {
        schedulesToCreate = [{
          train_id: parseInt(formData.train_id),
          departure_date: formatDateStr(formData.departure_date),
          departure_time: formData.departure_time,
          arrival_time: formData.arrival_time,
          status: formData.status,
          is_overnight: formData.is_overnight || false,
          arrival_date: formData.is_overnight 
            ? formatDateStr(formData.arrival_date || addDays(formData.departure_date, 1)) 
            : null,
          driver_id: formData.driver_id || null,
          assistant_driver_id: formData.assistant_driver_id || null,
          guard_id: formData.guard_id || null,
          ticket_checker_ids: formData.ticket_checker_ids || [],
        }];
      } else {
        const dateList = generateRecurringSchedules();
        
        if (dateList.length === 0) {
          setErrors({ submit: 'No schedules to create. Please check your settings.' });
          setLoading(false);
          return;
        }

        schedulesToCreate = dateList.map(date => {
          const departureDateStr = formatDateStr(date);
          let arrivalDateStr = null;
          
          if (formData.is_overnight) {
            arrivalDateStr = formatDateStr(addDays(date, 1));
          }
          
          return {
            train_id: parseInt(formData.train_id),
            departure_date: departureDateStr,
            departure_time: formData.departure_time,
            arrival_time: formData.arrival_time,
            status: formData.status,
            is_overnight: formData.is_overnight || false,
            arrival_date: arrivalDateStr,
            driver_id: formData.driver_id || null,
            assistant_driver_id: formData.assistant_driver_id || null,
            guard_id: formData.guard_id || null,
            ticket_checker_ids: formData.ticket_checker_ids || [],
          };
        });
      }

      await onSubmit(schedulesToCreate);
      onClose();
    } catch (error) {
      console.error("Submit error:", error);
      console.error("Response data:", error.response?.data); 
      setErrors({ submit: error.response?.data?.detail || error.message || 'An error occurred' });

    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = () => {
    setShowDeletePopup(true);
  };

  const handleDeleteConfirm = async () => {
    if (!schedule || !onDelete) return;
    
    setDeleteLoading(true);
    try {
      await onDelete(schedule.id);
    } catch (error) {
      console.error("Delete error:", error);
      setShowDeletePopup(false);
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleDeleteCancel = () => {
    setShowDeletePopup(false);
  };

  if (!isOpen) return null;

  const selectedTrain = trains.find(t => t.id === parseInt(formData.train_id));
  const totalSchedules = generatedSchedules.length;

  const getTrainDisplayName = (train) => {
    const routeName = train.route?.name ||
                      (train.route?.origin ? `${train.route.origin} - ${train.route.destination}` : null) ||
                      (train.origin ? `${train.origin} - ${train.destination}` : 'No route');
    return `${train.train_no} - ${routeName}`;
  };

  const getRepeatModeLabel = (mode) => {
    const labels = {
      SINGLE: 'တစ်ကြိမ်တည်း',
      DAILY: 'နေ့စဉ်',
      WEEKLY: 'အပတ်စဉ်',
      MONTHLY: 'လစဉ်'
    };
    return labels[mode] || mode;
  };

  const getStaffDisplayName = (staffList, staffId) => {
    if (!staffId) return '';
    const staff = staffList.find(s => s.id === staffId);
    if (staff) {
      return staff.user?.full_name || staff.staff_id;
    }
    return staffId;
  };

  return (
    <>
      {/* Main Form Modal */}
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between p-6 border-b border-gray-200 sticky top-0 bg-white z-10">
            <h2 className="text-xl font-bold text-gray-900">
              {schedule ? 'အချိန်ဇယား ပြင်ဆင်မည်' : 'အချိန်ဇယားအသစ်'}
            </h2>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            {errors.submit && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
                {errors.submit}
              </div>
            )}

            {/* Train Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                ရထား <span className="text-red-500">*</span>
              </label>
              <select
                name="train_id"
                value={formData.train_id}
                onChange={handleChange}
                className={`w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.train_id ? 'border-red-500' : 'border-gray-300'
                }`}
              >
                <option value="">ရထားရွေးချယ်ပါ</option>
                {trains.map((train) => (
                  <option key={train.id} value={train.id}>
                    {getTrainDisplayName(train)}
                  </option>
                ))}
              </select>
              {errors.train_id && <p className="mt-1 text-sm text-red-600">{errors.train_id}</p>}
            </div>

            {/* Repeat Mode Selection */}
            {!schedule && (
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Repeat className="w-5 h-5 text-blue-600" />
                  <span className="font-medium text-gray-700">အချိန်ဇယား အမျိုးအစား</span>
                </div>
                
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {['SINGLE', 'DAILY', 'WEEKLY', 'MONTHLY'].map((mode) => (
                    <label
                      key={mode}
                      className={`flex items-center justify-center gap-2 p-2 rounded-lg cursor-pointer transition-colors ${
                        formData.repeat_mode === mode
                          ? 'bg-blue-600 text-white'
                          : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="repeat_mode"
                        value={mode}
                        checked={formData.repeat_mode === mode}
                        onChange={handleChange}
                        className="hidden"
                      />
                      <span className="text-sm font-medium">{getRepeatModeLabel(mode)}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Editing Mode Notice */}
            {schedule && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                <p className="text-sm text-yellow-700">
                  <AlertCircle className="w-4 h-4 inline mr-1" />
                  သင်သည် ရှိပြီးသား အချိန်ဇယားကို ပြင်ဆင်နေပါသည်။
                </p>
              </div>
            )}

            {/* Repeat Configuration */}
            {!schedule && formData.repeat_mode !== 'SINGLE' && (
              <div className="border border-blue-200 rounded-lg p-4 space-y-4 bg-blue-50/50">
                <div className="flex items-center gap-2 text-blue-700">
                  <AlertCircle className="w-4 h-4" />
                  <span className="text-sm">
                    {formData.repeat_mode === 'DAILY' 
                      ? 'နေ့စဉ် အချိန်ဇယားများ ဖန်တီးပေးမည်' 
                      : formData.repeat_mode === 'WEEKLY' 
                        ? 'ရွေးချယ်ထားသော ရက်များတွင် အပတ်စဉ် အချိန်ဇယားများ ဖန်တီးပေးမည်'
                        : 'ရွေးချယ်ထားသော ရက်များတွင် လစဉ် အချိန်ဇယားများ ဖန်တီးပေးမည်'}
                  </span>
                </div>

                {/* Interval */}
                {['DAILY', 'WEEKLY', 'MONTHLY'].includes(formData.repeat_mode) && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      ကြားကာလ ({formData.repeat_mode === 'DAILY' ? 'ရက်' : formData.repeat_mode === 'WEEKLY' ? 'ပတ်' : 'လ'}) <span className="text-red-500">*</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        name="repeat_interval"
                        value={formData.repeat_interval}
                        onChange={handleChange}
                        min="1"
                        max={formData.repeat_mode === 'DAILY' ? 30 : 12}
                        className={`w-20 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                          errors.repeat_interval ? 'border-red-500' : 'border-gray-300'
                        }`}
                      />
                      <span className="text-sm text-gray-600">
                        {formData.repeat_mode === 'DAILY' ? 'ရက်တစ်ကြိမ်' : formData.repeat_mode === 'WEEKLY' ? 'ပတ်တစ်ကြိမ်' : 'လတစ်ကြိမ်'}
                      </span>
                    </div>
                  </div>
                )}

                {/* Day Selection for Weekly/Monthly */}
                {['WEEKLY', 'MONTHLY'].includes(formData.repeat_mode) && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {formData.repeat_mode === 'WEEKLY' ? 'ရက်သတ္တပတ်၏ ရက်များ' : 'လ၏ ရက်များ'} <span className="text-red-500">*</span>
                    </label>
                    <div className={`grid ${formData.repeat_mode === 'WEEKLY' ? 'grid-cols-7' : 'grid-cols-7'} gap-1`}>
                      {(formData.repeat_mode === 'WEEKLY' ? daysOfWeek : Array.from({ length: 31 }, (_, i) => ({ value: i + 1, label: String(i + 1) }))).map((item) => (
                        <button
                          key={item.value}
                          type="button"
                          onClick={() => handleDayToggle(item.value)}
                          className={`p-2 text-xs rounded-lg transition-colors ${
                            formData.selectedDays.includes(item.value)
                              ? 'bg-blue-600 text-white hover:bg-blue-700'
                              : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* End Date */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    နောက်ဆုံးနေ့ <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <DatePicker
                      selected={formData.repeat_end_date}
                      onChange={(date) => handleDateChange(date, 'repeat_end_date')}
                      dateFormat="dd/MM/yyyy"
                      minDate={formData.departure_date || new Date()}
                      placeholderText="နောက်ဆုံးနေ့ ရွေးချယ်ပါ"
                      className={`w-full px-4 py-2.5 pl-10 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        errors.repeat_end_date ? 'border-red-500' : 'border-gray-300'
                      }`}
                    />
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  </div>
                </div>

                {/* Preview Button */}
                <Button type="button" onClick={previewSchedules} className="w-full bg-blue-100 hover:bg-blue-200 text-blue-700">
                  ဖန်တီးမည့် အချိန်ဇယားများ ကြိုတင်ကြည့်ရှုမည်
                </Button>
              </div>
            )}

            {/* Departure Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {schedule ? 'ထွက်ခွာမည့်နေ့' : formData.repeat_mode === 'SINGLE' ? 'ထွက်ခွာမည့်နေ့' : 'စတင်မည့်နေ့'} <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <DatePicker
                  selected={formData.departure_date}
                  onChange={(date) => handleDateChange(date, 'departure_date')}
                  dateFormat="dd/MM/yyyy"
                  minDate={new Date()}
                  placeholderText="နေ့စွဲ ရွေးချယ်ပါ"
                  className={`w-full px-4 py-2.5 pl-10 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.departure_date ? 'border-red-500' : 'border-gray-300'
                  }`}
                />
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              </div>
            </div>

            {/* Time Pickers */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  ထွက်ခွာမည့်အချိန် <span className="text-red-500">*</span>
                </label>
                <ScrollableTimePicker
                  value={formData.departure_time}
                  onChange={(time) => handleTimeChange('departure_time', time)}
                  minuteStep={15}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  ဆိုက်ရောက်မည့်အချိန် <span className="text-red-500">*</span>
                </label>
                <ScrollableTimePicker
                  value={formData.arrival_time}
                  onChange={(time) => handleTimeChange('arrival_time', time)}
                  minuteStep={15}
                />
              </div>
            </div>

            {/* Overnight Schedule Option */}
            <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.is_overnight || false}
                  onChange={(e) => setFormData(prev => ({ ...prev, is_overnight: e.target.checked }))}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 mt-0.5"
                />
                <div>
                  <div className="flex items-center gap-2">
                    <Moon className="w-4 h-4 text-indigo-500" />
                    <span className="text-sm font-medium text-gray-700">ညဖြတ်သန်းခရီးစဉ် (Overnight)</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    ညနေ ၅:၀၀ ထွက်ခွာ၍ နောက်နေ့ မနက် ၂:၀၀ ဆိုက်ရောက်ပါက ရွေးပါ
                  </p>
                </div>
              </label>
            </div>

            {/* Arrival Date (overnight only) */}
            {formData.is_overnight && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  ဆိုက်ရောက်မည့်နေ့ <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <DatePicker
                    selected={formData.arrival_date}
                    onChange={(date) => handleDateChange(date, 'arrival_date')}
                    dateFormat="dd/MM/yyyy"
                    minDate={formData.departure_date || new Date()}
                    placeholderText="ဆိုက်ရောက်မည့်နေ့"
                    className={`w-full px-4 py-2.5 pl-10 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      errors.arrival_date ? 'border-red-500' : 'border-gray-300'
                    }`}
                  />
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                </div>
              </div>
            )}

            {/* 🆕 Staff Assignment Section */}
            <div className="border border-gray-200 rounded-lg p-4 space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-5 h-5 text-blue-600" />
                <span className="font-medium text-gray-700">ဝန်ထမ်းတာဝန်ချထားခြင်း</span>
                {loadingStaff && <Loader className="w-4 h-4 animate-spin text-blue-500" />}
              </div>

              {/* Driver */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <UserCheck className="w-4 h-4 inline mr-1" />
                  ရထားမောင်းသူ (Driver)
                </label>
                <select
                  name="driver_id"
                  value={formData.driver_id}
                  onChange={handleChange}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">ရထားမောင်းသူ ရွေးချယ်ပါ</option>
                  {availableDrivers.map((staff) => (
                    <option key={staff.id} value={staff.id}>
                      {staff.user?.full_name || 'Unknown'} - {staff.staff_id}
                    </option>
                  ))}
                </select>
              </div>

              {/* Assistant Driver */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <UserCheck className="w-4 h-4 inline mr-1" />
                  လက်ထောက်ရထားမောင်းသူ (Asst. Driver)
                </label>
                <select
                  name="assistant_driver_id"
                  value={formData.assistant_driver_id}
                  onChange={handleChange}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">လက်ထောက်မောင်းသူ ရွေးချယ်ပါ</option>
                  {availableAssistants.map((staff) => (
                    <option key={staff.id} value={staff.id}>
                      {staff.user?.full_name || 'Unknown'} - {staff.staff_id}
                    </option>
                  ))}
                </select>
              </div>

              {/* Guard */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <UserCheck className="w-4 h-4 inline mr-1" />
                  ရထားစောင့် (Guard)
                </label>
                <select
                  name="guard_id"
                  value={formData.guard_id}
                  onChange={handleChange}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">ရထားစောင့် ရွေးချယ်ပါ</option>
                  {availableGuards.map((staff) => (
                    <option key={staff.id} value={staff.id}>
                      {staff.user?.full_name || 'Unknown'} - {staff.staff_id}
                    </option>
                  ))}
                </select>
              </div>

              {/* Ticket Checkers (Multi-select) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <UserCheck className="w-4 h-4 inline mr-1" />
                  လက်မှတ်စစ်ဆေးသူများ (Ticket Checkers)
                </label>
                {availableTicketCheckers.length > 0 ? (
                  <div className="space-y-1 max-h-32 overflow-y-auto border border-gray-200 rounded-lg p-2">
                    {availableTicketCheckers.map((staff) => (
                      <label
                        key={staff.id}
                        className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors ${
                          formData.ticket_checker_ids?.includes(staff.id)
                            ? 'bg-blue-50 border border-blue-200'
                            : 'hover:bg-gray-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={formData.ticket_checker_ids?.includes(staff.id) || false}
                          onChange={() => handleTicketCheckerToggle(staff.id)}
                          className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                        />
                        <span className="text-sm">
                          {staff.user?.full_name || 'Unknown'} - {staff.staff_id}
                        </span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">ရရှိနိုင်သော လက်မှတ်စစ်ဆေးသူ မရှိပါ</p>
                )}
                {formData.ticket_checker_ids?.length > 0 && (
                  <p className="text-xs text-blue-600 mt-1">
                    ရွေးချယ်ထားသည်: {formData.ticket_checker_ids.length} ဦး
                  </p>
                )}
              </div>
            </div>

            {/* Status */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">အခြေအနေ</label>
              <select
                name="status"
                value={formData.status}
                onChange={handleChange}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="SCHEDULED">စီစဉ်ထားသည်</option>
                <option value="ACTIVE">လက်ရှိပြေးဆွဲနေသည်</option>
                <option value="COMPLETED">ပြီးစီးသည်</option>
                <option value="CANCELLED">ဖျက်သိမ်းသည်</option>
                <option value="DELAYED">နှောင့်နှေးသည်</option>
              </select>
            </div>

            {/* Preview of Generated Schedules */}
            {!schedule && showPreview && generatedSchedules.length > 0 && (
              <div className="border border-gray-200 rounded-lg p-4 max-h-48 overflow-y-auto">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-medium text-gray-700">
                    ဖန်တီးမည့် အချိန်ဇယားများ ({totalSchedules})
                  </h4>
                </div>
                <div className="space-y-1">
                  {generatedSchedules.slice(0, 20).map((date, index) => (
                    <div key={index} className="text-sm text-gray-600 flex items-center gap-2">
                      <Calendar className="w-3 h-3" />
                      <span>
                        {date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Preview Box */}
            {selectedTrain && formData.departure_date && (
              <div className="p-4 bg-blue-50 rounded-xl">
                <h3 className="text-sm font-semibold text-blue-900 mb-3">အချိန်ဇယား ကြိုတင်ကြည့်ရှုခြင်း</h3>
                <div className="space-y-2 text-sm text-blue-700">
                  <div className="flex items-center gap-2">
                    <span>🚂</span>
                    <span className="font-medium">{selectedTrain.train_no}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    <span>{formatDateStr(formData.departure_date)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    <span>{formData.departure_time} → {formData.arrival_time}</span>
                  </div>
                  {formData.driver_id && (
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4" />
                      <span>Driver: {getStaffDisplayName(availableDrivers, formData.driver_id)}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex space-x-3 pt-4 border-t border-gray-200">
              <Button type="button" onClick={onClose} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700">
                မလုပ်တော့ပါ
              </Button>
              
              {schedule && onDelete && (
                <Button type="button" onClick={handleDeleteClick} disabled={loading}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white flex items-center justify-center gap-2">
                  <Trash2 className="w-4 h-4" />ဖျက်သိမ်းမည်
                </Button>
              )}
              
              <Button type="submit" disabled={loading} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white">
                {loading ? 'သိမ်းဆည်းနေသည်...' : schedule ? 'ပြင်ဆင်မည်' : 'အချိန်ဇယားဖန်တီးမည်'}
              </Button>
            </div>
          </form>
        </div>
      </div>

      {/* Delete Confirmation Popup */}
      {showDeletePopup && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                  <Trash2 className="w-5 h-5 text-red-600" />
                </div>
                <h3 className="text-lg font-bold text-gray-900">အချိန်ဇယားဖျက်သိမ်းမည်</h3>
              </div>
              <button onClick={handleDeleteCancel} disabled={deleteLoading} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-6">
              <div className="flex items-start gap-3 mb-2">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-gray-600">
                  ဤအချိန်ဇယားအား ဖျက်သိမ်းလိုသည်မှာ သေချာပါသလား?
                </p>
              </div>
            </div>
            <div className="flex gap-3 p-6 border-t border-gray-200">
              <button onClick={handleDeleteCancel} disabled={deleteLoading} className="flex-1 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg">
                မလုပ်တော့ပါ
              </button>
              <button onClick={handleDeleteConfirm} disabled={deleteLoading} className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg disabled:opacity-50 flex items-center justify-center gap-2">
                {deleteLoading ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>ဖျက်နေသည်...</> : <><Trash2 className="w-4 h-4" />ဖျက်သိမ်းမည်</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ScheduleFormModal;
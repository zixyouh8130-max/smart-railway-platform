// pages/Admin/UsersManagement.jsx
import React, { useState, useEffect } from 'react';
import { 
  Search, Shield, User, X, Mail, Phone, 
  BadgeCheck, UserPlus, Train, Building2, 
  Briefcase, Edit, Trash2, AlertCircle, Loader
} from 'lucide-react';
import Button from '@/components/ui/button';
import Card from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import api from '@/api/axios';

const UsersManagement = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showStaffModal, setShowStaffModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const [staffForm, setStaffForm] = useState({
    staff_id: '',
    role: 'TRAIN_DRIVER',
    department: '',
    phone: '',
    emergency_contact: '',
    license_number: '',
    license_expiry_date: '',
    notes: ''
  });

  const [userForm, setUserForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    password: '',
    confirm_password: '',
    role: 'USER'
  });

  const staffRoles = [
    { value: 'TRAIN_DRIVER', label: 'Train Driver', icon: Train },
    { value: 'ASSISTANT_DRIVER', label: 'Assistant Driver', icon: Train },
    { value: 'TRAIN_GUARD', label: 'Train Guard', icon: Train },
    { value: 'TICKET_CHECKER', label: 'Ticket Checker', icon: BadgeCheck },
    { value: 'STATION_MASTER', label: 'Station Master', icon: Building2 },
    { value: 'STATION_STAFF', label: 'Station Staff', icon: Building2 },
    { value: 'DISPATCHER', label: 'Dispatcher', icon: Briefcase },
    { value: 'MAINTENANCE', label: 'Maintenance', icon: Briefcase },
    { value: 'INSPECTOR', label: 'Inspector', icon: Shield },
  ];

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await api.get('/auth/admin/users');
      setUsers(response.data);
    } catch (err) {
      console.error('Failed to fetch users:', err);
      
      if (err.response?.status === 401) {
        setError('အက်ဒမင် အခွင့်အရေး မရှိပါ။ ကျေးဇူးပြု၍ အက်ဒမင်အကောင့်ဖြင့် ဝင်ရောက်ပါ');
      } else if (err.response?.status === 403) {
        setError('ဤစာမျက်နှာကို ကြည့်ရှုရန် အခွင့်အရေး မရှိပါ');
      } else {
        setError('အသုံးပြုသူများ စာရင်းရယူရန် မအောင်မြင်ပါ');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    
    if (userForm.password !== userForm.confirm_password) {
      setError('စကားဝှက်များ မတူညီပါ');
      setSubmitting(false);
      return;
    }

    try {
      await api.post('/auth/register', {
        full_name: userForm.full_name,
        email: userForm.email,
        phone: userForm.phone,
        password: userForm.password
      });

      setSuccess('အသုံးပြုသူအသစ် ဖန်တီးပြီးပါပြီ');
      setShowCreateModal(false);
      resetUserForm();
      fetchUsers();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      if (err.response?.status === 409) {
        setError('ဤအီးမေးလ်ဖြင့် မှတ်ပုံတင်ထားပြီးဖြစ်သည်');
      } else {
        setError(err.response?.data?.detail || 'အသုံးပြုသူ ဖန်တီးရန် မအောင်မြင်ပါ');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateStaff = async (e) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    if (!selectedUser) {
      setError('ကျေးဇူးပြု၍ အသုံးပြုသူကို ရွေးချယ်ပါ');
      setSubmitting(false);
      return;
    }

    try {
      const response = await api.post('/staff', {
        user_id: selectedUser.id,
        staff_id: staffForm.staff_id,
        role: staffForm.role,
        phone: staffForm.phone || undefined,
        emergency_contact: staffForm.emergency_contact || undefined,
        department: staffForm.department || undefined,
        license_number: staffForm.license_number || undefined,
        license_expiry_date: staffForm.license_expiry_date || undefined,
        certification_details: staffForm.certification_details || undefined,
        notes: staffForm.notes || undefined
      });

      setSuccess(`${selectedUser.full_name} အား ဝန်ထမ်းအဖြစ် သတ်မှတ်ပြီးပါပြီ`);
      setShowStaffModal(false);
      resetStaffForm();
      setSelectedUser(null);
      fetchUsers();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      if (err.response?.status === 409) {
        setError('ဤဝန်ထမ်း ID ဖြင့် မှတ်ပုံတင်ထားပြီးဖြစ်သည်');
      } else {
        setError(err.response?.data?.detail || 'ဝန်ထမ်းအဖြစ် သတ်မှတ်ရန် မအောင်မြင်ပါ');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const resetUserForm = () => {
    setUserForm({
      full_name: '',
      email: '',
      phone: '',
      password: '',
      confirm_password: '',
      role: 'USER'
    });
    setError(null);
  };

  const resetStaffForm = () => {
    setStaffForm({
      staff_id: '',
      role: 'TRAIN_DRIVER',
      department: '',
      phone: '',
      emergency_contact: '',
      license_number: '',
      license_expiry_date: '',
      notes: ''
    });
    setError(null);
  };

  const openStaffModal = (user) => {
    setSelectedUser(user);
    setStaffForm(prev => ({
      ...prev,
      phone: user.phone || '',
      staff_id: `STF-${Date.now().toString().slice(-6)}`
    }));
    setShowStaffModal(true);
  };

  const getRoleBadge = (role) => {
    const badges = {
      'SUPER_ADMIN': 'bg-purple-100 text-purple-700 border-purple-200',
      'ADMIN': 'bg-red-100 text-red-700 border-red-200',
      'USER': 'bg-blue-100 text-blue-700 border-blue-200',
    };
    return badges[role] || 'bg-gray-100 text-gray-700 border-gray-200';
  };

  const getRoleLabel = (role) => {
    const labels = {
      'SUPER_ADMIN': 'စူပါအက်ဒမင်',
      'ADMIN': 'အက်ဒမင်',
      'USER': 'အသုံးပြုသူ',
    };
    return labels[role] || role;
  };

  const getStaffRoleLabel = (role) => {
    const found = staffRoles.find(r => r.value === role);
    return found ? found.label : role;
  };

  const filteredUsers = users.filter(user => {
    const matchesSearch = 
      user.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.phone?.includes(searchTerm);
    
    const matchesRole = roleFilter === 'ALL' || user.role === roleFilter;
    
    return matchesSearch && matchesRole;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader className="w-10 h-10 animate-spin text-railway-red-500 mx-auto mb-3" />
          <p className="text-gray-500">အချက်အလက်များ ရယူနေသည်...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <p className="text-gray-600 mt-1">စနစ်အသုံးပြုသူများနှင့် ဝန်ထမ်းများအား စီမံခန့်ခွဲပါ</p>
        </div>
        <Button 
          variant="primary"
          icon={<UserPlus className="w-5 h-5" />}
          onClick={() => setShowCreateModal(true)}
        >
          အသုံးပြုသူအသစ်
        </Button>
      </div>

      {/* Success/Error Messages */}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl flex items-center gap-2">
          <BadgeCheck className="w-5 h-5 flex-shrink-0" />
          <span>{success}</span>
          <button onClick={() => setSuccess(null)} className="ml-auto">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-center gap-2">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Search and Filter */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="အမည်၊ အီးမေးလ် သို့မဟုတ် ဖုန်းဖြင့် ရှာဖွေပါ..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-railway-red-500 focus:border-transparent outline-none"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-railway-red-500 outline-none bg-white"
        >
          <option value="ALL">အားလုံး</option>
          <option value="SUPER_ADMIN">စူပါအက်ဒမင်</option>
          <option value="ADMIN">အက်ဒမင်</option>
          <option value="USER">အသုံးပြုသူ</option>
        </select>
      </div>

      {/* Users Table */}
      <Card padding="p-0" hover={false}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">အသုံးပြုသူ</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">ဆက်သွယ်ရန်</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">အခန်းကဏ္ဍ</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">ဝန်ထမ်း</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">အခြေအနေ</th>
                <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase">လုပ်ဆောင်ချက်</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-6 py-12 text-center text-gray-500">
                    <User className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                    <p>အသုံးပြုသူ မတွေ့ရှိပါ</p>
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-railway-red-400 to-railway-orange-400 rounded-full flex items-center justify-center flex-shrink-0">
                          <User className="w-5 h-5 text-white" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{user.full_name}</p>
                          <p className="text-xs text-gray-500">ID: {user.id?.slice(0, 8)}...</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1 text-sm text-gray-900">
                        <Mail className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate max-w-[150px]">{user.email}</span>
                      </div>
                      <div className="flex items-center gap-1 text-sm text-gray-500 mt-1">
                        <Phone className="w-3 h-3 flex-shrink-0" />
                        {user.phone}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${getRoleBadge(user.role)}`}>
                        <Shield className="w-3 h-3" />
                        {getRoleLabel(user.role)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {user.staff ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700 border border-green-200">
                          <BadgeCheck className="w-3 h-3" />
                          {getStaffRoleLabel(user.staff.role)}
                        </span>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          icon={<UserPlus className="w-3 h-3" />}
                          onClick={() => openStaffModal(user)}
                        >
                          ဝန်ထမ်းသတ်မှတ်ရန်
                        </Button>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center gap-1">
                        <span className={`w-2 h-2 rounded-full ${user.is_active ? 'bg-green-500' : 'bg-red-500'}`} />
                        <span className="text-sm text-gray-600">
                          {user.is_active ? 'သုံးနေ' : 'ပိတ်'}
                        </span>
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="ghost" size="sm" icon={<Edit className="w-4 h-4" />} />
                        <Button variant="ghost" size="sm" icon={<Trash2 className="w-4 h-4 text-red-500" />} />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>စုစုပေါင်း: {filteredUsers.length} ဦး</span>
      </div>

      {/* Create User Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => { setShowCreateModal(false); resetUserForm(); }}>
          <Card padding="p-6" className="w-full max-w-md" hover={false} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">အသုံးပြုသူအသစ် ဖန်တီးရန်</h2>
              <Button variant="ghost" size="sm" icon={<X className="w-5 h-5" />} onClick={() => { setShowCreateModal(false); resetUserForm(); }} />
            </div>
            
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <Label>အမည် *</Label>
                <input type="text" required value={userForm.full_name}
                  onChange={(e) => setUserForm({...userForm, full_name: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-railway-red-500 outline-none mt-1"
                  placeholder="အမည်အပြည့်အစုံ" />
              </div>
              <div>
                <Label>အီးမေးလ် *</Label>
                <input type="email" required value={userForm.email}
                  onChange={(e) => setUserForm({...userForm, email: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-railway-red-500 outline-none mt-1"
                  placeholder="email@example.com" />
              </div>
              <div>
                <Label>ဖုန်းနံပါတ် *</Label>
                <input type="text" required value={userForm.phone}
                  onChange={(e) => setUserForm({...userForm, phone: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-railway-red-500 outline-none mt-1"
                  placeholder="09xxxxxxxxx" />
              </div>
              <div>
                <Label>စကားဝှက် * (အနည်းဆုံး ၆ လုံး)</Label>
                <input type="password" required minLength={6} value={userForm.password}
                  onChange={(e) => setUserForm({...userForm, password: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-railway-red-500 outline-none mt-1"
                  placeholder="စကားဝှက်" />
              </div>
              <div>
                <Label>စကားဝှက် အတည်ပြုရန် *</Label>
                <input type="password" required minLength={6} value={userForm.confirm_password}
                  onChange={(e) => setUserForm({...userForm, confirm_password: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-railway-red-500 outline-none mt-1"
                  placeholder="စကားဝှက် ထပ်မံရိုက်ထည့်ပါ" />
              </div>
              
              <Separator />
              
              <div className="flex gap-3">
                <Button type="submit" variant="primary" className="flex-1" disabled={submitting}>
                  {submitting ? 'ဖန်တီးနေသည်...' : 'ဖန်တီးမည်'}
                </Button>
                <Button type="button" variant="outline" className="flex-1" onClick={() => { setShowCreateModal(false); resetUserForm(); }}>
                  မလုပ်တော့ပါ
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Create Staff Modal */}
      {showStaffModal && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => { setShowStaffModal(false); setSelectedUser(null); resetStaffForm(); }}>
          <Card padding="p-6" className="w-full max-w-lg max-h-[90vh] overflow-y-auto" hover={false} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900">ဝန်ထမ်းအဖြစ် သတ်မှတ်ရန်</h2>
                <p className="text-sm text-gray-500 mt-1">{selectedUser.full_name} ({selectedUser.email})</p>
              </div>
              <Button variant="ghost" size="sm" icon={<X className="w-5 h-5" />} onClick={() => { setShowStaffModal(false); setSelectedUser(null); resetStaffForm(); }} />
            </div>
            
            <form onSubmit={handleCreateStaff} className="space-y-4">
              <div>
                <Label>ဝန်ထမ်း ID *</Label>
                <input type="text" required value={staffForm.staff_id}
                  onChange={(e) => setStaffForm({...staffForm, staff_id: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-railway-red-500 outline-none mt-1"
                  placeholder="STF-000001" />
              </div>
              
              <div>
                <Label>ရာထူး *</Label>
                <select value={staffForm.role}
                  onChange={(e) => setStaffForm({...staffForm, role: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-railway-red-500 outline-none mt-1 bg-white">
                  {staffRoles.map((role) => (
                    <option key={role.value} value={role.value}>{role.label}</option>
                  ))}
                </select>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>ဌာန</Label>
                  <input type="text" value={staffForm.department}
                    onChange={(e) => setStaffForm({...staffForm, department: e.target.value})}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-railway-red-500 outline-none mt-1"
                    placeholder="ဥပမာ - ရန်ကုန်ဌာန" />
                </div>
                <div>
                  <Label>ဖုန်း</Label>
                  <input type="text" value={staffForm.phone}
                    onChange={(e) => setStaffForm({...staffForm, phone: e.target.value})}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-railway-red-500 outline-none mt-1"
                    placeholder="09xxxxxxxxx" />
                </div>
              </div>
              
              <div>
                <Label>အရေးပေါ်ဆက်သွယ်ရန်</Label>
                <input type="text" value={staffForm.emergency_contact}
                  onChange={(e) => setStaffForm({...staffForm, emergency_contact: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-railway-red-500 outline-none mt-1"
                  placeholder="အရေးပေါ်ဆက်သွယ်ရန် ဖုန်းနံပါတ်" />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>လိုင်စင်နံပါတ်</Label>
                  <input type="text" value={staffForm.license_number}
                    onChange={(e) => setStaffForm({...staffForm, license_number: e.target.value})}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-railway-red-500 outline-none mt-1"
                    placeholder="လိုင်စင်နံပါတ်" />
                </div>
                <div>
                  <Label>လိုင်စင်သက်တမ်းကုန်ရက်</Label>
                  <input type="date" value={staffForm.license_expiry_date}
                    onChange={(e) => setStaffForm({...staffForm, license_expiry_date: e.target.value})}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-railway-red-500 outline-none mt-1" />
                </div>
              </div>
              
              <div>
                <Label>မှတ်ချက်</Label>
                <textarea value={staffForm.notes}
                  onChange={(e) => setStaffForm({...staffForm, notes: e.target.value})}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-railway-red-500 outline-none resize-none mt-1"
                  placeholder="အခြားမှတ်ချက်များ..." />
              </div>
              
              <Separator />
              
              <div className="flex gap-3">
                <Button type="submit" variant="primary" className="flex-1" icon={<BadgeCheck className="w-5 h-5" />} disabled={submitting}>
                  {submitting ? 'သတ်မှတ်နေသည်...' : 'ဝန်ထမ်းအဖြစ် သတ်မှတ်မည်'}
                </Button>
                <Button type="button" variant="outline" className="flex-1" onClick={() => { setShowStaffModal(false); setSelectedUser(null); resetStaffForm(); }}>
                  မလုပ်တော့ပါ
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
};

export default UsersManagement;
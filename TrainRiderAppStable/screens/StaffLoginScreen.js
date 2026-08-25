import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import api from '../api/axios'; // your configured axios instance

const StaffLoginScreen = () => {
  const navigation = useNavigation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleStaffLogin = async () => {
    if (!form.email || !form.password) {
      setError('ကျေးဇူးပြု၍ အီးမေးလ်နှင့် စကားဝှက် ဖြည့်ပါ');
      return;
    }
    setError(null);
    setLoading(true);

    try {
      const response = await api.post('/auth/login', {
        email: form.email,
        password: form.password,
      });
      const { access_token, user } = response.data;

      if (!user.staff) {
        setError('ဤအကောင့်သည် ဝန်ထမ်းအကောင့် မဟုတ်ပါ။ ကျေးဇူးပြု၍ ဝန်ထမ်းအကောင့်ဖြင့် ဝင်ရောက်ပါ');
        setLoading(false);
        return;
      }

      // Store token and user info
      await AsyncStorage.setItem('token', access_token);
      await AsyncStorage.setItem('user', JSON.stringify(user));
      await AsyncStorage.setItem('staffInfo', JSON.stringify(user.staff));

      // Route staff to the workspace for their current staff role.
      if (user.staff.role === 'TRACK_ENGINEER') {
        navigation.replace('TrackEngineerHome');
      } else {
        navigation.replace('TrainRiderHome');
      }
    } catch (err) {
      console.error('Staff login error:', err);
      if (err.response?.status === 401) {
        setError('အီးမေးလ် သို့မဟုတ် စကားဝှက် မှားယွင်းနေပါသည်');
      } else if (err.response?.status === 403) {
        setError('ဤအကောင့်ကို ပိတ်ထားပါသည်');
      } else {
        setError('ဝင်ရောက်ရန် မအောင်မြင်ပါ။ ထပ်မံကြိုးစားပါ');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.card}>
        {/* Logo & Header */}
        <View style={styles.header}>
          <View style={styles.logoContainer}>
            <Icon name="train" size={40} color="#fff" />
          </View>
          <Text style={styles.title}>Railway Staff</Text>
          <Text style={styles.subtitle}>ဝန်ထမ်းအကောင့်ဖြင့် ဝင်ရောက်ပါ</Text>
        </View>

        {/* Error Message */}
        {error && (
          <View style={styles.errorBox}>
            <Icon name="alert-circle" size={20} color="#b91c1c" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Login Form */}
        <View style={styles.form}>
          <Text style={styles.label}>အီးမေးလ်</Text>
          <TextInput
            style={styles.input}
            placeholder="staff@railway.com"
            keyboardType="email-address"
            autoCapitalize="none"
            value={form.email}
            onChangeText={(text) => setForm({ ...form, email: text })}
          />

          <Text style={styles.label}>စကားဝှက်</Text>
          <TextInput
            style={styles.input}
            placeholder="စကားဝှက် ရိုက်ထည့်ပါ"
            secureTextEntry
            value={form.password}
            onChangeText={(text) => setForm({ ...form, password: text })}
          />

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleStaffLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Icon name="login" size={20} color="#fff" />
                <Text style={styles.buttonText}>ဝင်ရောက်မည်</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Staff Info */}
        <View style={styles.infoBox}>
          <View style={styles.infoHeader}>
            <Icon name="badge-account-horizontal" size={18} color="#2563eb" />
            <Text style={styles.infoTitle}>ဝန်ထမ်းများအတွက်</Text>
          </View>
          <Text style={styles.infoText}>
            ဝန်ထမ်းအကောင့်ဖြင့်သာ ဝင်ရောက်နိုင်ပါသည်။ အက်ဒမင်မှ ဝန်ထမ်းအကောင့် ဖန်တီးပေးရန် လိုအပ်ပါသည်။
          </Text>
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: 16,
    backgroundColor: '#dc2626',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
    gap: 8,
  },
  errorText: {
    color: '#b91c1c',
    fontSize: 14,
    flex: 1,
  },
  form: {
    gap: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#dc2626',
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 8,
    gap: 8,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  infoBox: {
    backgroundColor: '#eff6ff',
    borderRadius: 12,
    padding: 12,
    marginTop: 20,
  },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1d4ed8',
  },
  infoText: {
    fontSize: 12,
    color: '#2563eb',
    lineHeight: 18,
  },
  demoBox: {
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: 10,
    marginTop: 12,
  },
  demoText: {
    fontSize: 12,
    color: '#6b7280',
  },
});

export default StaffLoginScreen;
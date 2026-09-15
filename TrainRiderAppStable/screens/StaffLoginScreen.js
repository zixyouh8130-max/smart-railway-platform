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
import api, { DEFAULT_API_BASE_URL } from '../api/axios';
import { colors, radii, shadow } from '../theme/mobileTheme';

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
      } else if (!err.response) {
        setError(
          `မီးရထား နောက်ခံဆာဗာကို ဆက်သွယ်၍ မရပါ။\n${DEFAULT_API_BASE_URL}`,
        );
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
            <Icon name="train" size={39} color={colors.primaryDark} />
          </View>
          <Text style={styles.title}>Rail Connect</Text>
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
              <ActivityIndicator color={colors.primaryDark} />
            ) : (
              <>
                <Icon name="login" size={20} color={colors.primaryDark} />
                <Text style={styles.buttonText}>ဝင်ရောက်မည်</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Staff Info */}
        <View style={styles.infoBox}>
          <View style={styles.infoHeader}>
            <Icon name="badge-account-horizontal" size={18} color={colors.primaryStrong} />
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
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
  },
  card: {
    width: '100%',
    maxWidth: 430,
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  logoContainer: {
    width: 76,
    height: 76,
    borderRadius: 24,
    backgroundColor: colors.surfaceBlue,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 15,
  },
  title: {
    fontSize: 25,
    fontWeight: '900',
    color: colors.text,
  },
  subtitle: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 5,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: '#F6CDD2',
    padding: 12,
    borderRadius: radii.md,
    marginBottom: 16,
    gap: 8,
  },
  errorText: {
    color: colors.danger,
    fontSize: 12,
    lineHeight: 18,
    flex: 1,
  },
  form: { gap: 11 },
  label: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textSoft,
    marginBottom: 3,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
    backgroundColor: '#FBFDFF',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radii.md,
    paddingVertical: 14,
    marginTop: 8,
    gap: 8,
  },
  buttonDisabled: { opacity: 0.65 },
  buttonText: {
    color: colors.primaryText,
    fontSize: 15,
    fontWeight: '900',
  },
  infoBox: {
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
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
    fontSize: 12,
    fontWeight: '900',
    color: colors.primaryDark,
  },
  infoText: {
    fontSize: 11,
    color: colors.textSoft,
    lineHeight: 17,
  },
});

export default StaffLoginScreen;
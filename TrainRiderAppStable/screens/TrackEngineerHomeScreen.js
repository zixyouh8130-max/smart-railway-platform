import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import api from '../api/axios';
import trackIssuesApi from '../api/trackIssues';
import AIReviewModal from '../components/AIReviewModal';
import { colors, radii, shadow } from '../theme/mobileTheme';
import { caseStatusLabel, priorityLabel } from '../utils/myanmarLabels';

const CASE_COLUMNS = [
  ['OPEN', 'ဖွင့်ထား', 'inbox-outline'],
  ['ACKNOWLEDGED', 'လက်ခံပြီး', 'hand-okay'],
  ['IN_PROGRESS', 'လုပ်ဆောင်နေ', 'progress-wrench'],
  ['VERIFYING', 'အပြီးသတ်သုံးသပ်', 'shield-search-outline'],
  ['BLOCKED', 'ရပ်တန့်ထား', 'pause-circle-outline'],
  ['COMPLETED', 'ပြီးစီး', 'check-circle-outline'],
];

const STATUS_PALETTE = {
  OPEN: [colors.dangerSoft, colors.danger],
  ACKNOWLEDGED: [colors.surfaceBlue, colors.primaryDark],
  IN_PROGRESS: ['#EAFBFF', '#2F8FA8'],
  VERIFYING: [colors.violetSoft, colors.violet],
  BLOCKED: ['#F1F5F9', '#64748B'],
  COMPLETED: [colors.successSoft, colors.success],
  REOPENED: [colors.warningSoft, colors.warning],
};

const humanize = value => String(value || '—').replace(/_/g, ' ');
const shortId = value => (value ? String(value).slice(0, 8) : '—');
const normalizedCaseStatus = value => {
  const status = String(value || 'OPEN').toUpperCase();
  return status === 'REOPENED' ? 'OPEN' : CASE_COLUMNS.some(([key]) => key === status) ? status : 'OPEN';
};
const caseTitle = item => item.case_name || item.run_id || `စစ်ဆေးမှု ${String(item.inspection_id || '').slice(0, 14)}` || 'စစ်ဆေးမှုCase';

const PriorityPill = ({ value }) => {
  const text = String(value || '').toLowerCase();
  const urgent = /critical|urgent|high|priority/.test(text);
  const monitor = /monitor|medium/.test(text);
  const palette = urgent
    ? [colors.dangerSoft, colors.danger]
    : monitor
      ? [colors.warningSoft, colors.warning]
      : [colors.surfaceSoft, colors.textSoft];
  return (
    <View style={[styles.priorityPill, { backgroundColor: palette[0] }]}>
      <Text style={[styles.priorityText, { color: palette[1] }]}>{priorityLabel(value || 'ROUTINE')}</Text>
    </View>
  );
};

const CaseCard = ({ item, onOpen, onAI }) => {
  const status = String(item.status || 'OPEN').toUpperCase();
  const palette = STATUS_PALETTE[status] || STATUS_PALETTE.OPEN;
  const progress = Math.max(0, Math.min(100, Number(item.progress_percent || 0)));
  const total = Number(item.total_findings || item.issues_count || 0);
  const completed = Number(item.completed_findings || 0);

  return (
    <TouchableOpacity activeOpacity={0.88} style={styles.caseCard} onPress={() => onOpen?.(item.id)}>
      <View style={styles.caseTopRow}>
        <View style={[styles.statusPill, { backgroundColor: palette[0] }]}>
          <View style={[styles.statusDot, { backgroundColor: palette[1] }]} />
          <Text style={[styles.statusPillText, { color: palette[1] }]}>{caseStatusLabel(status)}</Text>
        </View>
        <TouchableOpacity
          style={styles.aiMiniButton}
          onPress={event => {
            event.stopPropagation?.();
            onAI?.(item);
          }}
        >
          <Icon name="robot-outline" size={17} color={colors.violet} />
        </TouchableOpacity>
      </View>

      <Text style={styles.caseTitle}>{caseTitle(item)}</Text>
      <Text style={styles.caseId}>Case #{shortId(item.id)}</Text>

      <View style={styles.cardMetaRow}>
        <View style={styles.metaChip}>
          <Icon name="clipboard-text-outline" size={14} color={colors.primaryStrong} />
          <Text style={styles.metaChipText}>ချို့ယွင်းချက် {total} ခု</Text>
        </View>
        <PriorityPill value={item.ai_overall_priority} />
      </View>

      <View style={styles.progressHeader}>
        <Text style={styles.progressLabel}>{completed}/{total} ပြီးစီး</Text>
        <Text style={styles.progressValue}>{Math.round(progress)}%</Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress}%` }]} />
      </View>


      <View style={styles.caseActions}>
        <View style={styles.openHint}>
          <Text style={styles.openHintText}>Case ဖွင့်ကြည့်ရန်</Text>
          <Icon name="arrow-right" size={16} color={colors.primaryDark} />
        </View>
      </View>
    </TouchableOpacity>
  );
};

const TrackEngineerHomeScreen = () => {
  const navigation = useNavigation();
  const { width } = useWindowDimensions();
  const columnWidth = Math.min(330, Math.max(278, width - 56));
  const [staffInfo, setStaffInfo] = useState(null);
  const [cases, setCases] = useState([]);
  const [includeCompleted, setIncludeCompleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [aiCase, setAiCase] = useState(null);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    try {
      const [me, mine] = await Promise.all([
        api.get('/auth/me'),
        trackIssuesApi.getMine(includeCompleted),
      ]);

      if (me.data?.staff?.role !== 'TRACK_ENGINEER') {
        navigation.replace('TrainRiderHome');
        return;
      }
      setStaffInfo(me.data.staff);
      setCases(Array.isArray(mine) ? mine : mine?.cases || mine?.items || []);
    } catch (error) {
      Alert.alert('စစ်ဆေးမှုCaseများ မရနိုင်ပါ', error.response?.data?.detail || error.message || 'ထပ်မံကြိုးစားပါ။');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [includeCompleted, navigation]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => navigation.addListener('focus', () => load(true)), [load, navigation]);

  const grouped = useMemo(() => {
    const result = Object.fromEntries(CASE_COLUMNS.map(([key]) => [key, []]));
    cases.forEach(item => result[normalizedCaseStatus(item.status)].push(item));
    return result;
  }, [cases]);

  const counts = useMemo(() => ({
    assigned: cases.length,
    active: cases.filter(item => ['ACKNOWLEDGED', 'IN_PROGRESS', 'VERIFYING', 'REOPENED'].includes(item.status)).length,
    unchecked: cases.reduce((sum, item) => sum + Math.max(0, Number(item.total_findings || 0) - Number(item.checked_findings || 0)), 0),
  }), [cases]);

  const logout = async () => {
    await AsyncStorage.multiRemove(['token', 'user', 'staffInfo']);
    navigation.reset({ index: 0, routes: [{ name: 'StaffLogin' }] });
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <View style={styles.loadingIcon}><Icon name="train-car" size={28} color={colors.primaryDark} /></View>
        <ActivityIndicator size="large" color={colors.primaryStrong} />
        <Text style={styles.loadingText}>စစ်ဆေးမှုCaseများ ရယူနေသည်…</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primaryStrong} />}
      >
        <View style={styles.hero}>
          <View style={styles.heroTopRow}>
            <View style={styles.identityRow}>
              <View style={styles.avatar}><Icon name="hard-hat" size={24} color={colors.primaryDark} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.eyebrow}>သံလမ်းစစ်ဆေးရေး အင်ဂျင်နီယာ</Text>
                <Text style={styles.heroTitle}>ကွင်းဆင်း ပြုပြင်ထိန်းသိမ်းမှု ဘုတ်</Text>
                <Text style={styles.heroSubtitle}>{staffInfo?.staff_id || '—'} · {staffInfo?.user?.full_name || 'သံလမ်းအင်ဂျင်နီယာ'}</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.logoutButton} onPress={logout}>
              <Icon name="logout" size={19} color={colors.textSoft} />
            </TouchableOpacity>
          </View>

          <View style={styles.statsRow}>
            {[
              ['briefcase-outline', counts.assigned, 'တာဝန်ပေးထား'],
              ['progress-clock', counts.active, 'လုပ်ဆောင်နေ'],
              ['clipboard-alert-outline', counts.unchecked, 'မစစ်ရသေး'],
            ].map(([icon, value, title]) => (
              <View key={title} style={styles.statCard}>
                <Icon name={icon} size={18} color={colors.primaryStrong} />
                <Text style={styles.statValue}>{value}</Text>
                <Text style={styles.statLabel}>{title}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.toolbar}>
          <View style={styles.toolbarCopy}>
            <Text style={styles.toolbarTitle}>စစ်ဆေးမှုCaseများ</Text>
            <Text style={styles.toolbarHint}>လုပ်ငန်းစဉ်အဆင့်များကို အလျားလိုက် ဆွဲကြည့်နိုင်ပါသည်။</Text>
          </View>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>ပြီးစီးသောCaseများ</Text>
            <Switch
              value={includeCompleted}
              onValueChange={setIncludeCompleted}
              trackColor={{ false: '#DCE8F1', true: '#BFE5FF' }}
              thumbColor={includeCompleted ? colors.primaryStrong : '#FFFFFF'}
            />
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.kanbanScroller} decelerationRate="fast">
          {CASE_COLUMNS.map(([key, title, icon]) => {
            const items = grouped[key] || [];
            return (
              <View key={key} style={[styles.kanbanColumn, { width: columnWidth }]}>
                <View style={styles.columnHeader}>
                  <View style={styles.columnTitleRow}>
                    <View style={styles.columnIcon}><Icon name={icon} size={16} color={colors.primaryDark} /></View>
                    <Text style={styles.columnTitle}>{title}</Text>
                  </View>
                  <View style={styles.countBubble}><Text style={styles.countBubbleText}>{items.length}</Text></View>
                </View>
                {items.length ? items.map(item => (
                  <CaseCard
                    key={item.id}
                    item={item}
                    onOpen={id => navigation.navigate('TrackIssueDetail', { caseId: id })}
                    onAI={setAiCase}
                  />
                )) : (
                  <View style={styles.emptyColumn}>
                    <Icon name="tray" size={24} color={colors.borderStrong} />
                    <Text style={styles.emptyColumnText}>Case မရှိသေးပါ</Text>
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>

      </ScrollView>

      <AIReviewModal visible={Boolean(aiCase)} inspectionCase={aiCase} onClose={() => setAiCase(null)} />
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 14, paddingTop: 18, paddingBottom: 36 },
  loadingContainer: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingIcon: { width: 58, height: 58, borderRadius: 18, backgroundColor: colors.surfaceBlue, alignItems: 'center', justifyContent: 'center', marginBottom: 3 },
  loadingText: { color: colors.textSoft, fontSize: 13 },
  hero: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.xl, padding: 16, ...shadow },
  heroTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  identityRow: { flex: 1, flexDirection: 'row', gap: 11, alignItems: 'center' },
  avatar: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.surfaceBlue, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.borderStrong },
  eyebrow: { color: colors.primaryStrong, fontSize: 9.5, fontWeight: '900', letterSpacing: 1.1 },
  heroTitle: { color: colors.text, fontSize: 19, fontWeight: '900', marginTop: 2 },
  heroSubtitle: { color: colors.muted, fontSize: 11, marginTop: 3 },
  logoutButton: { width: 40, height: 40, borderRadius: 14, backgroundColor: colors.surfaceSoft, alignItems: 'center', justifyContent: 'center' },
  statsRow: { flexDirection: 'row', gap: 8, marginTop: 16 },
  statCard: { flex: 1, backgroundColor: colors.surfaceSoft, borderRadius: 15, borderWidth: 1, borderColor: colors.border, padding: 10, alignItems: 'center' },
  statValue: { color: colors.text, fontSize: 18, fontWeight: '900', marginTop: 3 },
  statLabel: { color: colors.muted, fontSize: 9.5, marginTop: 1 },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 18, marginBottom: 10, paddingHorizontal: 2 },
  toolbarCopy: { flex: 1 },
  toolbarTitle: { color: colors.text, fontSize: 16, fontWeight: '900' },
  toolbarHint: { color: colors.muted, fontSize: 10.5, marginTop: 2 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  toggleLabel: { color: colors.textSoft, fontSize: 10.5, fontWeight: '700' },
  kanbanScroller: { paddingBottom: 8, gap: 10, paddingRight: 14 },
  kanbanColumn: { backgroundColor: '#F1F8FD', borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: 10, minHeight: 260 },
  columnHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9, paddingHorizontal: 2 },
  columnTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7, flex: 1 },
  columnIcon: { width: 28, height: 28, borderRadius: 9, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  columnTitle: { color: colors.textSoft, fontSize: 11.5, fontWeight: '800', flexShrink: 1 },
  countBubble: { minWidth: 26, height: 26, borderRadius: 13, paddingHorizontal: 7, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  countBubbleText: { color: colors.textSoft, fontSize: 10.5, fontWeight: '800' },
  caseCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: 13, marginBottom: 9, ...shadow },
  caseTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: radii.pill, paddingHorizontal: 8, paddingVertical: 5 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusPillText: { fontSize: 9.5, fontWeight: '800' },
  aiMiniButton: { width: 32, height: 32, borderRadius: 10, backgroundColor: colors.violetSoft, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#DDD3F7' },
  caseTitle: { color: colors.text, fontSize: 14.5, fontWeight: '900', lineHeight: 20, marginTop: 10 },
  caseId: { color: colors.muted, fontSize: 9.5, fontWeight: '700', marginTop: 3, letterSpacing: 0.4 },
  cardMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, alignItems: 'center', marginTop: 10 },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.surfaceSoft, paddingHorizontal: 8, paddingVertical: 5, borderRadius: radii.pill },
  metaChipText: { color: colors.textSoft, fontSize: 9.5, fontWeight: '700' },
  priorityPill: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: radii.pill },
  priorityText: { fontSize: 9, fontWeight: '900', textTransform: 'uppercase' },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
  progressLabel: { color: colors.muted, fontSize: 9.5 },
  progressValue: { color: colors.textSoft, fontSize: 10, fontWeight: '800' },
  progressTrack: { height: 6, borderRadius: 999, backgroundColor: colors.surfaceBlue, overflow: 'hidden', marginTop: 5 },
  progressFill: { height: '100%', backgroundColor: colors.primaryStrong, borderRadius: 999 },
  caseActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  openHint: { flexDirection: 'row', gap: 3, alignItems: 'center' },
  openHintText: { color: colors.primaryDark, fontSize: 10.5, fontWeight: '800' },
  emptyColumn: { minHeight: 110, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderStrong, backgroundColor: 'rgba(255,255,255,0.65)', borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', gap: 7 },
  emptyColumnText: { color: colors.muted, fontSize: 10.5 },
});

export default TrackEngineerHomeScreen;

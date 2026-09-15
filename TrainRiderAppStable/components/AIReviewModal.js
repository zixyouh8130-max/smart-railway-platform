import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import SheetModal from './SheetModal';
import { colors, radii } from '../theme/mobileTheme';
import { defectTypeLabel, priorityLabel } from '../utils/myanmarLabels';

const humanize = value => String(value || 'unassessed').replace(/_/g, ' ');

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
    <View style={[styles.pill, { backgroundColor: palette[0] }]}>
      <Text style={[styles.pillText, { color: palette[1] }]}>{priorityLabel(value)}</Text>
    </View>
  );
};

const ListBlock = ({ title, items, icon = 'check-circle-outline' }) => {
  if (!Array.isArray(items) || !items.length) return null;
  return (
    <View style={styles.sectionCard}>
      <Text style={styles.sectionLabel}>{title}</Text>
      {items.map((item, index) => (
        <View key={`${title}-${index}`} style={styles.listRow}>
          <Icon name={icon} size={16} color={colors.primaryStrong} />
          <Text style={styles.listText}>
            {typeof item === 'string' ? item : JSON.stringify(item)}
          </Text>
        </View>
      ))}
    </View>
  );
};

const AIReviewModal = ({ visible, onClose, inspectionCase = null, issue = null }) => {
  const [showRaw, setShowRaw] = useState(false);
  const isCase = Boolean(inspectionCase) && !issue;
  const subject = issue || inspectionCase || {};
  const snapshot = subject.ai_snapshot || {};
  const context = snapshot.event_context || {};
  const visual = snapshot.event_visual_review || {};
  const areas = Array.isArray(snapshot.areas_of_attention) ? snapshot.areas_of_attention : [];

  const checks = useMemo(
    () => context.recommended_checks || visual.recommended_checks || [],
    [context.recommended_checks, visual.recommended_checks],
  );

  const reason = context.priority_reason || visual.assessment || visual.summary || visual.reason;
  const priority = isCase ? inspectionCase?.ai_overall_priority : issue?.ai_priority;

  return (
    <SheetModal
      visible={visible}
      onClose={() => {
        setShowRaw(false);
        onClose?.();
      }}
      title={isCase ? 'စစ်ဆေးမှု သုံးသပ်ချက်' : 'ချို့ယွင်းချက် သုံးသပ်ချက်'}
      subtitle={isCase ? 'စစ်ဆေးမှုတစ်ခုလုံးအတွက် ဆုံးဖြတ်ချက်အထောက်အကူ' : defectTypeLabel(issue?.defect_type) || 'ချို့ယွင်းချက် သုံးသပ်ချက်'}
      icon="robot-outline"
      fullHeight
    >
      <View style={styles.heroRow}>
        <View style={styles.aiIcon}>
          <Icon name="creation" size={23} color={colors.violet} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.heroTitle}>{isCase ? 'စစ်ဆေးမှု အကျဉ်းချုပ်' : 'ချို့ယွင်းချက် သုံးသပ်ချက်'}</Text>
          <Text style={styles.heroHint}>AI အကြံပြုချက်အဖြစ်သာ အသုံးပြုပါ။ ကွင်းဆင်းအတည်ပြုချက်ကို အဓိကထားပါ။</Text>
        </View>
        <PriorityPill value={priority} />
      </View>

      {snapshot.executive_summary ? (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionLabel}>အကျဉ်းချုပ်</Text>
          <Text style={styles.body}>{snapshot.executive_summary}</Text>
        </View>
      ) : null}

      {!isCase ? (
        <>
          <View style={styles.infoGrid}>
            <View style={styles.infoCard}>
              <Text style={styles.miniLabel}>ချို့ယွင်းချက်</Text>
              <Text style={styles.infoValue}>{defectTypeLabel(issue?.defect_type)}</Text>
            </View>
            <View style={styles.infoCard}>
              <Text style={styles.miniLabel}>ယုံကြည်မှု</Text>
              <Text style={styles.infoValue}>
                {issue?.confidence != null ? `${(Number(issue.confidence) * 100).toFixed(1)}%` : '—'}
              </Text>
            </View>
          </View>

          {reason ? (
            <View style={[styles.sectionCard, styles.violetCard]}>
              <Text style={[styles.sectionLabel, { color: colors.violet }]}>ဤဦးစားပေးအဆင့် သတ်မှတ်ရသည့်အကြောင်း</Text>
              <Text style={styles.body}>{reason}</Text>
            </View>
          ) : null}
          <ListBlock title="အကြံပြုထားသော ကွင်းဆင်းစစ်ဆေးချက်များ" items={checks} icon="shield-check-outline" />
        </>
      ) : (
        <>
          <ListBlock title="အဓိကတွေ့ရှိချက်များ" items={snapshot.key_findings} />
          <ListBlock title="အကြံပြုလုပ်ဆောင်ချက်များ" items={snapshot.recommended_actions} icon="wrench-outline" />
          {areas.length ? (
            <View style={[styles.sectionCard, styles.warningCard]}>
              <Text style={[styles.sectionLabel, { color: colors.warning }]}>အထူးဂရုပြုရန် နေရာများ</Text>
              {areas.map((area, index) => (
                <View key={index} style={styles.areaCard}>
                  <View style={styles.areaHeader}>
                    <PriorityPill value={area.priority} />
                    <Text style={styles.areaDistance}>
                      {area.start_distance_m != null && area.end_distance_m != null
                        ? `${area.start_distance_m}–${area.end_distance_m} m`
                        : humanize(area.rail_side)}
                    </Text>
                  </View>
                  {area.assessment ? <Text style={styles.body}>{area.assessment}</Text> : null}
                </View>
              ))}
            </View>
          ) : null}
          {snapshot.trend_assessment ? (
            <View style={styles.sectionCard}>
              <Text style={styles.sectionLabel}>အခြေအနေပြောင်းလဲမှု သုံးသပ်ချက်</Text>
              <Text style={styles.body}>{snapshot.trend_assessment}</Text>
            </View>
          ) : null}
          <ListBlock title="ကန့်သတ်ချက်များ" items={snapshot.limitations} icon="information-outline" />
        </>
      )}

      <TouchableOpacity style={styles.rawButton} onPress={() => setShowRaw(value => !value)}>
        <Icon name="code-json" size={17} color={colors.textSoft} />
        <Text style={styles.rawButtonText}>{showRaw ? 'နည်းပညာဒေတာ ပိတ်ရန်' : 'နည်းပညာဒေတာ ကြည့်ရန်'}</Text>
      </TouchableOpacity>
      {showRaw ? (
        <View style={styles.rawBox}>
          <Text style={styles.rawText}>{JSON.stringify(snapshot, null, 2)}</Text>
        </View>
      ) : null}
    </SheetModal>
  );
};

const styles = StyleSheet.create({
  heroRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radii.lg, padding: 13, marginBottom: 12,
  },
  aiIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.violetSoft, alignItems: 'center', justifyContent: 'center' },
  heroTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  heroHint: { color: colors.muted, fontSize: 10.5, marginTop: 3, lineHeight: 15 },
  pill: { borderRadius: radii.pill, paddingHorizontal: 9, paddingVertical: 5 },
  pillText: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  sectionCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: 13, marginBottom: 11 },
  sectionLabel: { color: colors.textSoft, fontSize: 10.5, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 },
  body: { color: colors.textSoft, fontSize: 13, lineHeight: 20 },
  listRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginBottom: 8 },
  listText: { flex: 1, color: colors.textSoft, fontSize: 12.5, lineHeight: 19 },
  violetCard: { backgroundColor: '#FBF9FF', borderColor: '#DDD3F7' },
  warningCard: { backgroundColor: '#FFFCF7', borderColor: '#F6DFBC' },
  infoGrid: { flexDirection: 'row', gap: 10, marginBottom: 11 },
  infoCard: { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, padding: 12 },
  miniLabel: { color: colors.muted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  infoValue: { color: colors.text, fontSize: 13, fontWeight: '800', marginTop: 5 },
  areaCard: { backgroundColor: colors.surface, borderRadius: radii.md, padding: 10, marginTop: 8, borderWidth: 1, borderColor: '#F4E6CC' },
  areaHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 7 },
  areaDistance: { color: colors.muted, fontSize: 10.5, fontWeight: '700' },
  rawButton: { alignSelf: 'flex-start', flexDirection: 'row', gap: 6, alignItems: 'center', paddingVertical: 8 },
  rawButtonText: { color: colors.textSoft, fontSize: 11.5, fontWeight: '700' },
  rawBox: { backgroundColor: '#102A43', borderRadius: radii.md, padding: 12, marginTop: 4 },
  rawText: { color: '#D9EAF7', fontFamily: 'monospace', fontSize: 10, lineHeight: 15 },
});

export default AIReviewModal;

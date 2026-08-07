import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import type {
  GeneratedPlanOutput,
  PlanSprintGroup,
  PlanPhaseGroup,
  BacklogGroup,
  RoleGroup,
} from "@/lib/thinking-graph/plan/planTypes";

const C = {
  text:    "#111827",
  muted:   "#6b7280",
  border:  "#e5e7eb",
  surf:    "#f9fafb",
  primary: "#7c3aed",
  pBg:     "#f5f3ff",
  epic:    "#7c3aed",
  story:   "#1d4ed8",
  task:    "#4b5563",
  high:    "#b45309",
  medium:  "#4f46e5",
  low:     "#9ca3af",
  green:   "#065f46",
  gBg:     "#ecfdf5",
};

const s = StyleSheet.create({
  page:    { paddingVertical: 44, paddingHorizontal: 40, fontFamily: "Helvetica", fontSize: 10, color: C.text, lineHeight: 1.4 },
  h1:      { fontSize: 18, fontFamily: "Helvetica-Bold", marginBottom: 5 },
  meta:    { fontSize: 9, color: C.muted, marginBottom: 14 },
  divider: { height: 0.75, backgroundColor: C.border, marginBottom: 16 },
  summary: { fontSize: 10, color: C.muted, lineHeight: 1.65, marginBottom: 18 },

  sBox:      { marginBottom: 14, borderWidth: 0.75, borderColor: C.border, borderRadius: 5 },
  sHead:     { paddingVertical: 9, paddingHorizontal: 12, backgroundColor: C.surf, flexDirection: "row", alignItems: "flex-start", borderBottomWidth: 0.75, borderBottomColor: C.border },
  sHeadLeft: { flex: 1 },
  sTitle:    { fontSize: 11, fontFamily: "Helvetica-Bold" },
  sSub:      { fontSize: 8, color: C.muted, marginTop: 2 },
  spBadge:   { fontSize: 9, fontFamily: "Helvetica-Bold", color: C.primary, backgroundColor: C.pBg, paddingVertical: 2, paddingHorizontal: 7, borderRadius: 8 },

  tRow:   { flexDirection: "row", paddingVertical: 6, paddingHorizontal: 12, borderBottomWidth: 0.5, borderBottomColor: "#f3f4f6", alignItems: "flex-start" },
  tBadge: { fontSize: 7, fontFamily: "Helvetica-Bold", paddingVertical: 2, paddingHorizontal: 4, borderRadius: 2, marginRight: 7 },
  tTitle: { flex: 1, fontSize: 9 },
  tMeta:  { fontSize: 8, color: C.muted, marginLeft: 6, maxWidth: 90 },
  tSP:    { fontSize: 8, fontFamily: "Helvetica-Bold", color: C.muted, width: 20, textAlign: "right" },

  phRow:     { flexDirection: "row", marginBottom: 20 },
  phDotCol:  { flexDirection: "column", alignItems: "center", width: 14, marginRight: 12 },
  phDot:     { width: 11, height: 11, borderRadius: 5.5, backgroundColor: C.primary, marginTop: 6 },
  phLine:    { flex: 1, width: 1.5, backgroundColor: C.border, marginTop: 4 },
  phContent: { flex: 1 },
  phTitle:   { fontSize: 12, fontFamily: "Helvetica-Bold", marginBottom: 3 },
  phDesc:    { fontSize: 9, color: C.muted, lineHeight: 1.6, marginBottom: 5 },
  phExit:    { fontSize: 9, color: C.green, backgroundColor: C.gBg, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 4, marginBottom: 8 },
  phTitleRow:{ flexDirection: "row", alignItems: "center", marginBottom: 4 },

  blHead:  { flexDirection: "row", paddingVertical: 6, paddingHorizontal: 12, backgroundColor: C.surf, borderBottomWidth: 0.75, borderBottomColor: C.border },
  blHCell: { fontSize: 7, fontFamily: "Helvetica-Bold", color: C.muted },
  blRow:   { flexDirection: "row", paddingVertical: 6, paddingHorizontal: 12, borderBottomWidth: 0.5, borderBottomColor: "#f3f4f6", alignItems: "center" },
  prDot:   { width: 7, height: 7, borderRadius: 3.5, marginRight: 9 },

  roleIO:      { flexDirection: "row", paddingVertical: 8, paddingHorizontal: 12, borderBottomWidth: 0.75, borderBottomColor: C.border },
  roleIOSec:   { flex: 1 },
  roleIOLabel: { fontSize: 7, fontFamily: "Helvetica-Bold", color: C.muted, marginBottom: 3 },
  roleIOItem:  { fontSize: 8, color: C.muted },
});

const TYPE_COLOR: Record<string, string> = { epic: C.epic, story: C.story, task: C.task };

function TBadge({ type }: { type: string }) {
  const color = TYPE_COLOR[type] ?? C.task;
  return <Text style={[s.tBadge, { color, backgroundColor: color + "22" }]}>{type.toUpperCase()}</Text>;
}

function TRow({ type, title, points, meta }: { type: string; title: string; points?: number; meta?: string }) {
  return (
    <View style={s.tRow}>
      <TBadge type={type} />
      <Text style={s.tTitle}>{title}</Text>
      {meta != null && <Text style={s.tMeta}>{meta}</Text>}
      {points != null && <Text style={s.tSP}>{points}</Text>}
    </View>
  );
}

const FORMAT_LABELS: Record<string, string> = {
  sprints: "By Sprints",
  phases:  "By Phases",
  backlog: "Flat Backlog",
  roles:   "By Roles",
};

function PlanPdfDocument({ plan }: { plan: GeneratedPlanOutput }) {
  const today = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const fmtLabel = FORMAT_LABELS[plan.format] ?? plan.format;

  const totalSP = (() => {
    if (plan.format === "sprints") return plan.groups.reduce((a, g) => a + g.total_points, 0);
    if (plan.format === "phases")  return plan.groups.flatMap(p => p.items).reduce((a, t) => a + (t.story_points ?? 0), 0);
    if (plan.format === "backlog") return plan.groups.flatMap(g => g.items).reduce((a, t) => a + t.story_points, 0);
    if (plan.format === "roles")   return plan.groups.flatMap(g => g.items).reduce((a, t) => a + t.story_points, 0);
    return 0;
  })();
  const totalTasks = plan.groups.reduce((a, g) => a + g.items.length, 0);

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View>
          <Text style={s.h1}>{plan.title || "Implementation Plan"}</Text>
          <Text style={s.meta}>{fmtLabel}{"  ·  "}{totalTasks} tasks{"  ·  "}{totalSP} story points{"  ·  "}{today}</Text>
        </View>
        <View style={s.divider} />

        {plan.summary != null && plan.summary !== "" && (
          <Text style={s.summary}>{plan.summary}</Text>
        )}

        {plan.format === "sprints" && plan.groups.map((sprint: PlanSprintGroup) => (
          <View key={sprint.id} style={s.sBox}>
            <View style={s.sHead}>
              <View style={s.sHeadLeft}>
                <Text style={s.sTitle}>{sprint.title}</Text>
                {sprint.goal != null && <Text style={s.sSub}>{sprint.goal}</Text>}
              </View>
              <Text style={s.spBadge}>{sprint.total_points} SP</Text>
            </View>
            {sprint.items.map((t) => (
              <TRow key={t.id} type={t.type} title={t.title} points={t.story_points} meta={t.source_synthetic} />
            ))}
          </View>
        ))}

        {plan.format === "phases" && plan.groups.map((phase: PlanPhaseGroup, pi: number) => {
          const total = phase.items.reduce((a, t) => a + (t.story_points ?? 0), 0);
          const isLast = pi === plan.groups.length - 1;
          return (
            <View key={phase.id || pi} style={s.phRow}>
              <View style={s.phDotCol}>
                <View style={s.phDot} />
                {!isLast && <View style={s.phLine} />}
              </View>
              <View style={s.phContent}>
                <View style={s.phTitleRow}>
                  <Text style={s.phTitle}>{phase.title}</Text>
                  {total > 0 && <Text style={[s.spBadge, { marginLeft: 10 }]}>{total} SP</Text>}
                </View>
                {phase.description != null && <Text style={s.phDesc}>{phase.description}</Text>}
                {phase.exit_criteria != null && <Text style={s.phExit}>✓  {phase.exit_criteria}</Text>}
                <View style={s.sBox}>
                  {phase.items.map((t) => (
                    <TRow key={t.id} type={t.type} title={t.title} points={t.story_points} meta={t.source_synthetic} />
                  ))}
                </View>
              </View>
            </View>
          );
        })}

        {plan.format === "backlog" && (() => {
          const items = (plan.groups[0] as BacklogGroup | undefined)?.items ?? [];
          const prColor: Record<string, string> = { high: C.high, medium: C.medium, low: C.low };
          return (
            <View style={s.sBox}>
              <View style={s.blHead}>
                <View style={{ width: 16 }} />
                <Text style={[s.blHCell, { width: 48 }]}>TYPE</Text>
                <Text style={[s.blHCell, { flex: 1 }]}>TASK</Text>
                <Text style={[s.blHCell, { width: 80 }]}>OWNER</Text>
                <Text style={[s.blHCell, { width: 20, textAlign: "right" }]}>SP</Text>
              </View>
              {items.map((t) => (
                <View key={t.id} style={s.blRow}>
                  <View style={[s.prDot, { backgroundColor: prColor[t.priority] ?? C.low }]} />
                  <TBadge type={t.type} />
                  <Text style={[s.tTitle, { marginLeft: 6 }]}>{t.title}</Text>
                  <Text style={[s.tMeta, { width: 80, marginLeft: 0 }]}>{t.source_synthetic}</Text>
                  <Text style={s.tSP}>{t.story_points}</Text>
                </View>
              ))}
            </View>
          );
        })()}

        {plan.format === "roles" && plan.groups.map((group: RoleGroup) => {
          const total = group.items.reduce((a, t) => a + t.story_points, 0);
          return (
            <View key={group.id} style={s.sBox}>
              <View style={s.sHead}>
                <Text style={[s.sTitle, { flex: 1 }]}>{group.title}</Text>
                <Text style={s.spBadge}>{total} SP</Text>
              </View>
              {(group.inputs.length > 0 || group.outputs.length > 0) && (
                <View style={s.roleIO}>
                  {group.inputs.length > 0 && (
                    <View style={s.roleIOSec}>
                      <Text style={s.roleIOLabel}>RECEIVES</Text>
                      {group.inputs.map((inp, i) => <Text key={i} style={s.roleIOItem}>· {inp}</Text>)}
                    </View>
                  )}
                  {group.outputs.length > 0 && (
                    <View style={s.roleIOSec}>
                      <Text style={s.roleIOLabel}>DELIVERS</Text>
                      {group.outputs.map((out, i) => <Text key={i} style={s.roleIOItem}>· {out}</Text>)}
                    </View>
                  )}
                </View>
              )}
              {group.items.map((t) => (
                <TRow key={t.id} type={t.type} title={t.title} points={t.story_points} meta={t.role ?? undefined} />
              ))}
            </View>
          );
        })}
      </Page>
    </Document>
  );
}

export async function generatePlanPdf(plan: GeneratedPlanOutput): Promise<Blob> {
  const { pdf } = await import("@react-pdf/renderer");
  return pdf(<PlanPdfDocument plan={plan} />).toBlob();
}

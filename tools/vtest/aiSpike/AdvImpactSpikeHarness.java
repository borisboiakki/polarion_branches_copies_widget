import java.util.*;
import java.util.regex.*;

/**
 * Smoke test of the advImpact spike widget (tests/advImpact-v0.1.x/spike-widget/aiSpike) with Velocity 1.4 on the docBranches
 * mocks (VforIA test set; duplicates links from the copies to the originals). The SQL of the spike is answered by a small
 * interpreter of the generated statements (SQL_HOOK); it checks the template logic, NOT the behaviour of Polarion SQL
 * (that is what the spike on 2512 is for). Usage: java AdvImpactSpikeHarness <spikeWidgetDir> <outDir>
 */
public class AdvImpactSpikeHarness {

    static List<Object> hook(String sql) {
        if (sql.contains("IN (SELECT l.") || sql.startsWith("SELECT DISTINCT w3") || sql.startsWith("WITH")) { return new ArrayList<Object>(); }   // nested / join / recursive: syntax only
        // bfs, one level: ... wt.c_id IN ('a','b') (down) or ... ws.c_id IN (...) (up)
        boolean down = sql.contains("wt.c_id IN (");
        boolean up = sql.contains("ws.c_id IN (");
        if (!sql.startsWith("SELECT DISTINCT") || !(down || up)) { return null; }
        Set<String> roles = WidgetHarness.listAfter(sql, "l.c_role IN (");
        Set<String> ids = WidgetHarness.listAfter(sql, down ? "wt.c_id IN (" : "ws.c_id IN (");
        Set<String> excluded = WidgetHarness.listAfter(sql, "c_type NOT IN (");
        List<Object> out = new ArrayList<Object>();
        Set<WidgetHarness.WorkItem> seen = new LinkedHashSet<WidgetHarness.WorkItem>();
        for (WidgetHarness.WorkItem s : WidgetHarness.ITEMS.values()) {
            for (WidgetHarness.Link l : s.getLinkedWorkItemsStructsDirect()) {
                WidgetHarness.WorkItem t = l.getLinkedItem();
                if (t.isUnresolvable() || !roles.contains(l.getLinkRole().getId())) { continue; }
                WidgetHarness.WorkItem near = down ? t : s;
                WidgetHarness.WorkItem far = down ? s : t;
                if (near.getProjectId().equals(far.getProjectId()) && ids.contains(near.getId()) && !excluded.contains(far.getType().getId())) { seen.add(far); }
            }
        }
        out.addAll(seen);
        return out;
    }

    static String run(String dir, String out, String name, String test, String direction, String mode, int levels, String startMode) throws Exception {
        List<Object> roles = new ArrayList<Object>();
        roles.add(new WidgetHarness.RoleOpt("duplicates"));
        // Single-select @document: singleValue() = model-backed option (guide 2.1).
        WidgetHarness.DocOpt doc = null;
        for (WidgetHarness.Module m : WidgetHarness.MODULES) { if (m.getId().equals("SRS_Test") && m.project.equals("VforIA")) { doc = new WidgetHarness.DocOpt(m); } }
        Map<String, WidgetHarness.Param> p = new HashMap<String, WidgetHarness.Param>();
        p.put("test", new WidgetHarness.Param(test, null));
        p.put("doc", new WidgetHarness.Param(doc, null));
        p.put("roles", new WidgetHarness.Param(null, roles));
        p.put("direction", new WidgetHarness.Param(direction, null));
        p.put("levels", new WidgetHarness.Param(Integer.valueOf(levels), null));
        p.put("mode", new WidgetHarness.Param(mode, null));
        p.put("paths", new WidgetHarness.Param("yes", null));
        p.put("startMode", new WidgetHarness.Param(startMode, null));
        p.put("startQuery", new WidgetHarness.Param("type:systemRequirement", null));
        p.put("sqlKind", new WidgetHarness.Param("nested", null));
        p.put("customLucene", new WidgetHarness.Param("", null));
        p.put("customSql", new WidgetHarness.Param("select w.c_uri from workitem w", null));
        p.put("excludedTypes", new WidgetHarness.Param("heading", null));
        p.put("cap", new WidgetHarness.Param(Integer.valueOf(5000), null));
        p.put("maxRows", new WidgetHarness.Param(Integer.valueOf(30), null));
        String html = WidgetHarness.render(dir, p, false, out + "/velocity-" + name + ".log");
        WidgetHarness.write(out + "/" + name + ".html", "<!doctype html><meta charset=utf-8><body>" + html);
        WidgetHarness.check(!Pattern.compile("(?<![A-Za-z0-9_])[$][!]?[{]?[a-zA-Z]").matcher(html).find(), name + ": no unrendered Velocity reference");
        return html;
    }

    public static void main(String[] args) throws Exception {
        WidgetHarness.buildTestSet();
        WidgetHarness.SQL_HOOK = new java.util.function.Function<String, List<Object>>() {
            public List<Object> apply(String sql) { return hook(sql); }
        };
        String dir = args[0];
        String out = args[1];
        // SRS_Test (A) has 5 requirements; B, C, D (duplicates / branched / derived) link to A. Role duplicates: B (5), E (5, inherited to A and to B).
        String h = run(dir, out, "start-all", "start", "down", "sql", 3, "all");
        WidgetHarness.check(h.contains("(without excluded types): <b>5</b>"), "start: 5 items of SRS_Test without the heading");
        WidgetHarness.check(h.contains("<b>5</b> in the start document") && h.contains("b) docid") && h.contains("b) sqlscope")
            && h.contains("document.id:&quot;Requirements/SRS_Test&quot; AND (type:systemRequirement)"), "start: both query scopes rendered");
        WidgetHarness.check(h.contains("(read with singleValue())"), "start: start document read with singleValue()");
        h = run(dir, out, "bfs-sql-down", "bfs", "down", "sql", 3, "all");
        WidgetHarness.check(h.contains("<tr><td>1</td><td>5</td><td>1</td><td>10</td>"), "bfs sql down: level 1 reaches B (5) and E (5, inherited links to A)");
        WidgetHarness.check(h.contains("<tr><td>2</td><td>10</td><td>1</td><td>0</td><td>5</td>"), "bfs sql down: level 2 expands the 10 items, 5 rows already visited (E links to B and A)");
        h = run(dir, out, "bfs-api-down", "bfs", "down", "api", 3, "all");
        WidgetHarness.check(h.contains("<tr><td>1</td><td>5</td><td>0</td><td>10</td>"), "bfs api down: same level 1 as the SQL mode, no queries");
        WidgetHarness.check(h.contains("API probe on start item"), "bfs api: probe of Direct and Back");
        WidgetHarness.check(h.contains("VIA-516|1|VIA-509|duplicates|d") && !h.contains("returned nothing usable"), "bfs api: parent edge with direction");
        WidgetHarness.check(Pattern.compile("all links between the 15 reached items <b>15</b>").matcher(h).find(), "bfs api: all links between reached items (B->A 5, E->A 5, E->B 5)");
        h = run(dir, out, "bfs-sql-up", "bfs", "up", "sql", 2, "docid");
        WidgetHarness.check(h.contains("<tr><td>0</td><td>5</td>"), "bfs sql up: start items from the query (5 requirements of the document)");
        h = run(dir, out, "bfs-both", "bfs", "both", "sql", 3, "all");
        WidgetHarness.check(h.contains("Total start / end"), "bfs both: renders");
        h = run(dir, out, "lucene", "lucene", "down", "sql", 3, "all");
        WidgetHarness.check(h.contains("linkedWorkItemsOf:([{&quot;filter&quot;:&quot;SQL:(SELECT w.c_uri FROM workitem w") && h.contains("&quot;follows&quot;:[&quot;duplicates&quot;],&quot;steps&quot;:3}])"), "lucene: linkedWorkItemsOf query built");
        h = run(dir, out, "sql-nested", "sql", "down", "sql", 3, "all");
        WidgetHarness.check(h.contains("IN (SELECT l.fk_uri_p_workitem FROM struct_workitem_linkedworkitems l WHERE") && h.contains(" OR w.c_uri IN (")
            && h.contains("AND w.c_type NOT IN ('heading')"), "sql nested: union of the levels, type filter");
        WidgetHarness.SQL_HOOK = null;
    }
}

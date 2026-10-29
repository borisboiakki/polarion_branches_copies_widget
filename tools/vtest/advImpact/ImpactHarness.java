import java.util.*;
import java.util.regex.*;

/**
 * Renders the built advImpact widget (widgets/advImpact/dist/advImpact/render.vm) with Velocity 1.4 against the mock
 * Polarion objects of tools/vtest/docBranches/WidgetHarness.java, on an impact test set (roles satisfies / verifies):
 *
 *   Specs/CustomerSpec  VIA-1, VIA-2 customerRequirement, VIA-3, VIA-4 customerNote, VIA-5 heading
 *   _default/SysReq_A   VIA-11 satisfies 1, 12 satisfies 2, 12 satisfies an unresolvable item, 13 satisfies 2 and 5 (heading),
 *                       12 satisfies 11 (same document)
 *   _default/SysReq_B   VIA-21 satisfies 3, VIA-22 satisfies 1
 *   _default/SwReq_C    VIA-31 satisfies 11, VIA-32 satisfies 21, VIA-31 verifies 41 (cycle with Test_T)
 *   _default/Test_T     VIA-41 verifies 31
 *   _default/Deep_D     VIA-51 verifies 41
 *   _default/Other      VIA-61 (no link)
 *
 * Downstream from CustomerSpec (3 levels): level 1 = 11, 12, 13 (A), 21, 22 (B); level 2 = 31, 32 (C); level 3 = 41 (T).
 * Both from SysReq_A: down 31 (C), 41 (T), 51 (D); up 1, 2 (CustomerSpec); SysReq_B (a sibling through CustomerSpec) not reached.
 *
 * The traversal SQL is answered by an interpreter of the generated statements (SQL_HOOK); the work item query by a
 * "type:X" filter (QUERY_HOOK). Both check the template logic, not Polarion's SQL or Lucene (verified on 2512, spike).
 * Usage: java ImpactHarness <widgetDir> <outDir>   (writes browser-fragment.html, pdf-fragment.html, logs)
 */
public class ImpactHarness {

    static WidgetHarness.Module mod(String folder, String name) {
        WidgetHarness.Module m = new WidgetHarness.Module(folder, name, name.replace('_', ' '));
        WidgetHarness.MODULES.add(m);
        return m;
    }

    static WidgetHarness.Module spec, a, b, c, t, d;
    static final List<String> SQL_LOG = new ArrayList<String>();

    static void buildTestSet() {
        spec = mod("Specs", "CustomerSpec");
        a = mod("_default", "SysReq_A");
        b = mod("_default", "SysReq_B");
        c = mod("_default", "SwReq_C");
        t = mod("_default", "Test_T");
        d = mod("_default", "Deep_D");
        WidgetHarness.Module other = mod("_default", "Other");
        WidgetHarness.wi(1, "customerRequirement", spec);
        WidgetHarness.wi(2, "customerRequirement", spec);
        WidgetHarness.wi(3, "customerNote", spec);
        WidgetHarness.wi(4, "customerNote", spec);
        WidgetHarness.wi(5, "heading", spec);
        for (int i = 11; i <= 13; i++) { WidgetHarness.wi(i, "systemRequirement", a); }
        for (int i = 21; i <= 22; i++) { WidgetHarness.wi(i, "systemRequirement", b); }
        for (int i = 31; i <= 32; i++) { WidgetHarness.wi(i, "softwareRequirement", c); }
        WidgetHarness.wi(41, "testCase", t);
        WidgetHarness.wi(51, "testCase", d);
        WidgetHarness.wi(61, "systemRequirement", other);
        WidgetHarness.link(11, "satisfies", 1);
        WidgetHarness.link(12, "satisfies", 2);
        WidgetHarness.link(13, "satisfies", 2);
        WidgetHarness.link(13, "satisfies", 5);
        WidgetHarness.link(12, "satisfies", 11);
        WidgetHarness.link(21, "satisfies", 3);
        WidgetHarness.link(22, "satisfies", 1);
        WidgetHarness.link(31, "satisfies", 11);
        WidgetHarness.link(32, "satisfies", 21);
        WidgetHarness.link(41, "verifies", 31);
        WidgetHarness.link(31, "verifies", 41);
        WidgetHarness.link(51, "verifies", 41);
        WidgetHarness.link(12, "parent", 13);
        WidgetHarness.ITEMS.get("VIA-12").title = "Title | with; separators";
        WidgetHarness.WorkItem ghost = new WidgetHarness.WorkItem("VIA-999", "customerRequirement", spec);
        spec.items.remove(ghost);
        ghost.unresolvable = true;
        WidgetHarness.ITEMS.get("VIA-12").links.add(new WidgetHarness.Link("satisfies", ghost));
    }

    /** One traversal level: "... wt.c_id IN (...)" (downstream: link sources) or "... ws.c_id IN (...)" (upstream: targets). */
    static List<Object> traversal(String sql) {
        boolean down = sql.contains("wt.c_id IN (");
        boolean up = sql.contains("ws.c_id IN (");
        if (!sql.startsWith("SELECT DISTINCT") || !(down || up)) { return null; }
        SQL_LOG.add(sql);
        Set<String> roles = WidgetHarness.listAfter(sql, "l.c_role IN (");
        Set<String> ids = WidgetHarness.listAfter(sql, down ? "wt.c_id IN (" : "ws.c_id IN (");
        Set<String> excluded = WidgetHarness.listAfter(sql, "c_type NOT IN (");
        Set<WidgetHarness.WorkItem> out = new LinkedHashSet<WidgetHarness.WorkItem>();
        for (WidgetHarness.WorkItem s : WidgetHarness.ITEMS.values()) {
            for (WidgetHarness.Link l : s.getLinkedWorkItemsStructsDirect()) {
                WidgetHarness.WorkItem tg = l.getLinkedItem();
                if (tg.isUnresolvable() || !roles.contains(l.getLinkRole().getId())) { continue; }
                WidgetHarness.WorkItem near = down ? tg : s;
                WidgetHarness.WorkItem far = down ? s : tg;
                if (near.getProjectId().equals(far.getProjectId()) && ids.contains(near.getId()) && !excluded.contains(far.getType().getId())) {
                    out.add(far);
                }
            }
        }
        return new ArrayList<Object>(out);
    }

    /** Lucene stand-in: "type:X" keeps the items of type X (the SQL:() document restriction is checked by the template). */
    static List<WidgetHarness.WorkItem> query(String q) {
        Matcher m = Pattern.compile("type:([A-Za-z0-9_]+)").matcher(q);
        List<WidgetHarness.WorkItem> out = new ArrayList<WidgetHarness.WorkItem>();
        String type = m.find() ? m.group(1) : null;
        for (WidgetHarness.WorkItem w : WidgetHarness.ITEMS.values()) {
            if (type == null || w.getType().getId().equals(type)) { out.add(w); }
        }
        return out;
    }

    static List<Object> list(Object... o) { return new ArrayList<Object>(Arrays.asList(o)); }

    static Map<String, WidgetHarness.Param> params(WidgetHarness.Module start, String dir, int levels, Object... roles) {
        Map<String, WidgetHarness.Param> p = new HashMap<String, WidgetHarness.Param>();
        p.put("doc", new WidgetHarness.Param(start == null ? null : new WidgetHarness.DocOpt(start), null));
        List<Object> rl = new ArrayList<Object>();
        for (Object r : roles) { rl.add(new WidgetHarness.RoleOpt((String) r)); }
        p.put("roles", new WidgetHarness.Param(null, rl));
        p.put("direction", new WidgetHarness.Param(dir, null));
        p.put("levels", new WidgetHarness.Param(Integer.valueOf(levels), null));
        p.put("startQuery", new WidgetHarness.Param("", null));
        p.put("excludedTypes", new WidgetHarness.Param(null, list(new WidgetHarness.RoleOpt("heading"))));
        p.put("lineCounts", new WidgetHarness.Param("show", null));
        p.put("extraFields", new WidgetHarness.Param(null, list("items")));
        p.put("height", new WidgetHarness.Param(Integer.valueOf(520), null));
        return p;
    }

    static String attr(String html, String cls) {
        Matcher m = Pattern.compile("class=\"" + cls + "\" data-v=\"([^\"]*)\"").matcher(html);
        return m.find() ? m.group(1) : "";
    }

    /** Ids of the reached items of the page model, sorted. */
    static String itemIds(String html) {
        List<String> ids = new ArrayList<String>();
        for (String part : attr(html, "ai-it").split(";")) {
            if (!part.isEmpty()) { ids.add(part.split("[|]")[0]); }
        }
        Collections.sort(ids);
        return String.join(",", ids);
    }

    public static void main(String[] args) throws Exception {
        buildTestSet();
        WidgetHarness.SQL_HOOK = new java.util.function.Function<String, List<Object>>() {
            public List<Object> apply(String sql) { return traversal(sql); }
        };
        WidgetHarness.QUERY_HOOK = new java.util.function.Function<String, List<WidgetHarness.WorkItem>>() {
            public List<WidgetHarness.WorkItem> apply(String q) { return query(q); }
        };
        String dir = args[0];
        String out = args[1];

        // Browser view: downstream from CustomerSpec, 3 levels, satisfies + verifies.
        String br = WidgetHarness.render(dir, params(spec, "down", 3, "satisfies", "verifies"), false, out + "/velocity-browser.log");
        WidgetHarness.write(out + "/browser-fragment.html", br);
        WidgetHarness.check(itemIds(br).equals("VIA-1,VIA-11,VIA-12,VIA-13,VIA-2,VIA-21,VIA-22,VIA-3,VIA-31,VIA-32,VIA-4,VIA-41"),
            "downstream 3 levels: start items and levels 1-3 reached, heading and level 4 left out: " + itemIds(br));
        WidgetHarness.check(br.contains("data-dir=\"down\" data-levels=\"3\" data-start=\"VforIA/Specs/CustomerSpec\""), "root: direction, levels, start document");
        WidgetHarness.check(br.contains("data-roles=\"satisfies|satisfies|is satisfied by;verifies|verifies|is verified by\""), "roles with names and opposite names");
        WidgetHarness.check(attr(br, "ai-it").startsWith("VIA-1|0|customerRequirement|1|Title VIA-1;"), "start item flagged, document index 0 = start document");
        WidgetHarness.check(attr(br, "ai-it").contains("VIA-12|1|systemRequirement|0|Title   with  separators;"), "separators in titles replaced");
        WidgetHarness.check(attr(br, "ai-ty").contains("customerRequirement|customerRequirement;") && attr(br, "ai-ty").contains("systemRequirement|systemRequirement;"),
            "type names of the reached items (start item picker)");
        String links = attr(br, "ai-ln");
        WidgetHarness.check(links.contains("VIA-11|VIA-1|satisfies;") && links.contains("VIA-12|VIA-11|satisfies;") && links.contains("VIA-31|VIA-41|verifies;")
            && links.contains("VIA-41|VIA-31|verifies;") && !links.contains("VIA-999") && !links.contains("parent") && !links.contains("VIA-5|"),
            "links between reached items: same-document and cycle links kept, unresolvable, unselected role and unreached targets left out");
        WidgetHarness.check(br.contains("data-k=\"VforIA/Specs/CustomerSpec\"") && br.contains("data-k=\"VforIA/_default/Test_T\"")
            && !br.contains("data-k=\"VforIA/_default/Other\"") && !br.contains("data-k=\"VforIA/_default/Deep_D\""), "documents: only those with reached items");
        int queries = SQL_LOG.size();
        WidgetHarness.check(queries == 3, "one traversal query per level and direction (" + queries + ")");

        // Static view
        String pdf = WidgetHarness.render(dir, params(spec, "down", 3, "satisfies", "verifies"), true, out + "/velocity-pdf.log");
        WidgetHarness.write(out + "/pdf-fragment.html", pdf);
        WidgetHarness.check(!pdf.contains("<script") && pdf.contains("downstream, 3 levels, 8 impacted work items in 4 documents"), "PDF: header, no script");
        WidgetHarness.check(pdf.contains("<td>_default / SysReq_A</td><td>Downstream level 1</td><td>3</td><td>3</td>")
            && pdf.contains("<td>_default / SwReq_C</td><td>Downstream level 2</td><td>2</td>")
            && pdf.contains("<td>_default / Test_T</td><td>Downstream level 3</td><td>1</td>")
            && pdf.contains("<td>Specs / CustomerSpec</td><td>Start document</td><td>0</td><td>4</td>"), "PDF: documents with position and impacted items");
        WidgetHarness.check(pdf.contains("<td>_default / SysReq_A</td><td>satisfies 3</td><td>Specs / CustomerSpec</td>")
            && pdf.contains("<td>_default / Test_T</td><td>verifies 1</td><td>_default / SwReq_C</td>")
            && !pdf.contains("<td>_default / SwReq_C</td><td>verifies"), "PDF: relations along the paths only (the cycle link back is not a path)");
        WidgetHarness.check(pdf.contains("<td>VIA-41</td><td>Title VIA-41</td><td>_default / Test_T</td><td>downstream</td><td>3</td>"), "PDF: impacted items with level");

        // Both directions from SysReq_A: no sibling SysReq_B.
        String both = WidgetHarness.render(dir, params(a, "both", 3, "satisfies", "verifies"), false, out + "/velocity-both.log");
        WidgetHarness.write(out + "/both-fragment.html", both);
        WidgetHarness.check(itemIds(both).equals("VIA-1,VIA-11,VIA-12,VIA-13,VIA-2,VIA-31,VIA-41,VIA-51"),
            "both: downstream C, T, D and upstream CustomerSpec, sibling SysReq_B not reached: " + itemIds(both));
        String bothPdf = WidgetHarness.render(dir, params(a, "both", 3, "satisfies", "verifies"), true, out + "/velocity-bothpdf.log");
        WidgetHarness.check(bothPdf.contains("<td>Specs / CustomerSpec</td><td>Upstream level 1</td><td>2</td>")
            && bothPdf.contains("<td>_default / Deep_D</td><td>Downstream level 3</td>") && !bothPdf.contains("SysReq_B"), "both, PDF: upstream on level 1, no sibling");

        // Upstream from SwReq_C, satisfies only.
        String up = WidgetHarness.render(dir, params(c, "up", 3, "satisfies"), false, out + "/velocity-up.log");
        WidgetHarness.check(itemIds(up).equals("VIA-1,VIA-11,VIA-21,VIA-3,VIA-31,VIA-32"), "up from SwReq_C: A, B then CustomerSpec: " + itemIds(up));

        // Start query: type:customerRequirement = VIA-1, VIA-2 only.
        Map<String, WidgetHarness.Param> q = params(spec, "down", 1, "satisfies", "verifies");
        q.put("startQuery", new WidgetHarness.Param("type:customerRequirement", null));
        String sub = WidgetHarness.render(dir, q, false, out + "/velocity-query.log");
        WidgetHarness.check(itemIds(sub).equals("VIA-1,VIA-11,VIA-12,VIA-13,VIA-2,VIA-22"), "start query: subset VIA-1, VIA-2 and what links to them: " + itemIds(sub));
        WidgetHarness.check(sub.contains("data-query=\"type:customerRequirement\""), "start query passed to the page");
        q.put("startQuery", new WidgetHarness.Param("type:nothing", null));
        String none = WidgetHarness.render(dir, q, true, out + "/velocity-noquery.log");
        WidgetHarness.check(none.contains("no work item of the start document matches the query"), "start query without match: message");

        // Levels capped at 7, roles at 5; missing parameters.
        String deep = WidgetHarness.render(dir, params(spec, "down", 12, "satisfies", "verifies"), false, out + "/velocity-deep.log");
        WidgetHarness.check(deep.contains("data-levels=\"7\"") && itemIds(deep).contains("VIA-51"), "levels capped at 7, level 4 reached");
        String six = WidgetHarness.render(dir, params(spec, "down", 2, "satisfies", "verifies", "parent", "duplicates", "derived_from", "branched_from"), false, out + "/velocity-six.log");
        WidgetHarness.check(six.contains("Only the first 5 link roles are used (1 ignored).") && !six.contains("branched_from|"), "more than 5 roles: warning");
        WidgetHarness.check(WidgetHarness.render(dir, params(null, "down", 3, "satisfies"), false, out + "/velocity-nodoc.log").contains("select the start document"), "no start document: message");
        WidgetHarness.check(WidgetHarness.render(dir, params(spec, "down", 3), false, out + "/velocity-norole.log").contains("select at least one link role"), "no role: message");
        WidgetHarness.Module gone = new WidgetHarness.Module("_default", "Gone", "Gone");
        gone.unresolvable = true;
        WidgetHarness.check(WidgetHarness.render(dir, params(gone, "down", 3, "satisfies"), false, out + "/velocity-gone.log").contains("the start document cannot be read"),
            "unreadable start document: message");
        collectionChecks(dir, out);
        System.out.println("Rendered: browser " + br.length() + " chars, pdf " + pdf.length() + " chars");
    }

    /**
     * Collection "Release 1" (VforIA/7), upstream collection "Base" (CollectionMocks, as observed on 2512):
     *   CustomerSpec @100  VIA-1, VIA-2 customerRequirement, VIA-3 customerNote, VIA-5 heading (VIA-4 only in HEAD)
     *   SysReq_A @101      VIA-11 satisfies 1 (title "Pinned title 11"), 12 satisfies 2, 13 satisfies 1 (HEAD: 13 satisfies 2),
     *                      12 satisfies 11 (same document)
     *   SwReq_C @90        (upstream collection) VIA-31 satisfies 11
     * Test_T, SysReq_B and Deep_D are not in the collection. Downstream from CustomerSpec: level 1 = 11, 12, 13,
     * level 2 = 31; Test_T (VIA-41 verifies 31 in HEAD) not reached.
     */
    static void collectionChecks(String dir, String out) throws Exception {
        CollectionMocks.Collection col = new CollectionMocks.Collection("VforIA", "7", "Release 1");
        CollectionMocks.Collection base = new CollectionMocks.Collection("VforIA", "2", "Base");
        col.upstream.add(base);
        CollectionMocks.RevModule specR = new CollectionMocks.RevModule("VforIA", "Specs", "CustomerSpec", "100");
        CollectionMocks.RevModule aR = new CollectionMocks.RevModule("VforIA", "_default", "SysReq_A", "101");
        CollectionMocks.RevModule cR = new CollectionMocks.RevModule("VforIA", "_default", "SwReq_C", "90");
        Map<Integer, WidgetHarness.WorkItem> r = new HashMap<Integer, WidgetHarness.WorkItem>();
        r.put(1, new WidgetHarness.WorkItem("VIA-1", "customerRequirement", specR));
        r.put(2, new WidgetHarness.WorkItem("VIA-2", "customerRequirement", specR));
        r.put(3, new WidgetHarness.WorkItem("VIA-3", "customerNote", specR));
        r.put(5, new WidgetHarness.WorkItem("VIA-5", "heading", specR));
        for (int i = 11; i <= 13; i++) { r.put(i, new WidgetHarness.WorkItem("VIA-" + i, "systemRequirement", aR)); }
        r.put(31, new WidgetHarness.WorkItem("VIA-31", "softwareRequirement", cR));
        r.get(11).title = "Pinned title 11";
        r.get(11).links.add(new WidgetHarness.Link("satisfies", r.get(1)));
        r.get(12).links.add(new WidgetHarness.Link("satisfies", r.get(2)));
        r.get(12).links.add(new WidgetHarness.Link("satisfies", r.get(11)));
        r.get(13).links.add(new WidgetHarness.Link("satisfies", r.get(1)));
        r.get(13).links.add(new WidgetHarness.Link("satisfies", r.get(5)));
        r.get(31).links.add(new WidgetHarness.Link("satisfies", r.get(11)));
        col.docs.add(specR);
        col.docs.add(aR);
        base.docs.add(cR);
        int queries = SQL_LOG.size();

        WidgetHarness.TRANSACTION = new CollectionMocks.Transaction(col);
        String cb = WidgetHarness.render(dir, params(spec, "down", 3, "satisfies", "verifies"), false, out + "/velocity-collection.log");
        WidgetHarness.write(out + "/collection-fragment.html", cb);
        WidgetHarness.check(cb.contains("data-col=\"VforIA/7\"") && cb.contains(">Collection: Release 1 (with upstream: Base)<"),
            "collection: context read, collection and upstream on the scope line");
        WidgetHarness.check(itemIds(cb).equals("VIA-1,VIA-11,VIA-12,VIA-13,VIA-2,VIA-3,VIA-31"),
            "collection: start items and reached items of the pinned revisions, Test_T not in the collection: " + itemIds(cb));
        WidgetHarness.check(SQL_LOG.size() == queries, "collection: no traversal query on the current tables");
        String cl = attr(cb, "ai-ln");
        WidgetHarness.check(cl.contains("VIA-13|VIA-1|satisfies;") && !cl.contains("VIA-13|VIA-2|") && cl.contains("VIA-12|VIA-11|satisfies;")
            && cl.contains("VIA-31|VIA-11|satisfies;") && !cl.contains("VIA-5"), "collection: links of the pinned revision, same-document link kept, heading left out");
        WidgetHarness.check(attr(cb, "ai-it").contains("VIA-11|1|systemRequirement|0|Pinned title 11;"), "collection: titles of the pinned revision");
        WidgetHarness.check(cb.contains("data-items=\"3\" data-rev=\"100\"") && cb.contains("data-rev=\"90\"")
            && !cb.contains("Test_T") && !cb.contains("SysReq_B"), "collection: documents at their revision, upstream collection included, others ignored");

        // Upstream from SwReq_C (in the upstream collection): VIA-11, then VIA-1.
        String cu = WidgetHarness.render(dir, params(c, "up", 3, "satisfies"), false, out + "/velocity-collectionup.log");
        WidgetHarness.check(itemIds(cu).equals("VIA-1,VIA-11,VIA-31"), "collection, upstream: SysReq_A then CustomerSpec: " + itemIds(cu));

        // Start query: evaluated on the current items (customerNote = VIA-3, VIA-4), kept when in the collection (VIA-3).
        Map<String, WidgetHarness.Param> q = params(spec, "down", 3, "satisfies", "verifies");
        q.put("startQuery", new WidgetHarness.Param("type:customerNote", null));
        String cq = WidgetHarness.render(dir, q, false, out + "/velocity-collectionquery.log");
        WidgetHarness.check(attr(cq, "ai-it").startsWith("VIA-3|0|customerNote|1|") && !cq.contains("VIA-4|"), "collection: start query intersected with the collection items");

        // Start document outside the collection.
        String out1 = WidgetHarness.render(dir, params(d, "down", 3, "satisfies"), false, out + "/velocity-collectionout.log");
        WidgetHarness.check(out1.contains("the start document _default / Deep_D is not in the collection Release 1"), "collection: start document not in the collection");

        // PDF export: no context, the parameter "Collection" gives the collection.
        WidgetHarness.TRANSACTION = new CollectionMocks.Transaction(null);
        Map<String, WidgetHarness.Param> pp = params(spec, "down", 3, "satisfies", "verifies");
        pp.put("collection", new WidgetHarness.Param(null, list(new CollectionMocks.ColOpt(col))));
        String cp = WidgetHarness.render(dir, pp, true, out + "/velocity-collectionpdf.log");
        WidgetHarness.check(cp.contains("Collection: Release 1 (with upstream: Base) &mdash; downstream, 3 levels, 4 impacted work items in 2 documents")
            && cp.contains("<td>_default / SwReq_C</td><td>Downstream level 2</td><td>1</td><td>1</td>")
            && cp.contains("<td>VIA-11</td><td>Pinned title 11</td>"), "collection PDF: collection from the parameter, pinned items and titles");

        // Mode "ignore": current items even in a collection.
        WidgetHarness.TRANSACTION = new CollectionMocks.Transaction(col);
        Map<String, WidgetHarness.Param> ig = params(spec, "down", 3, "satisfies", "verifies");
        ig.put("collectionMode", new WidgetHarness.Param("ignore", null));
        String ign = WidgetHarness.render(dir, ig, false, out + "/velocity-collectionignore.log");
        WidgetHarness.check(ign.contains("data-col=\"\"") && itemIds(ign).equals("VIA-1,VIA-11,VIA-12,VIA-13,VIA-2,VIA-21,VIA-22,VIA-3,VIA-31,VIA-32,VIA-4,VIA-41"),
            "collection context ignored: current items (HEAD)");
        WidgetHarness.TRANSACTION = null;
    }
}

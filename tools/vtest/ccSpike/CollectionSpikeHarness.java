import java.util.*;
import java.util.regex.*;

/**
 * Smoke test of the collection spike widget (tests/docCoverage-v0.3.x/spike-widget/ccSpike) with Velocity 1.4,
 * reusing the mock Polarion objects of tools/vtest/docBranches/WidgetHarness.java (VforIA test set).
 * The Rendering API collection mocks follow the guide (2.8) and the SDK collection SQL examples; they are NOT
 * verified on 2512 (that is what the spike is for). Revisions are not simulated: every object is at "HEAD".
 * Usage: java CollectionSpikeHarness <spikeWidgetDir> <outDir>
 */
public class CollectionSpikeHarness {

    static final List<WidgetHarness.Module> COLLECTION = new ArrayList<WidgetHarness.Module>();

    static WidgetHarness.Module mod(String name) {
        for (WidgetHarness.Module m : WidgetHarness.MODULES) { if (m.getId().equals(name) && m.project.equals("VforIA")) { return m; } }
        throw new IllegalArgumentException(name);
    }

    public static class ColOld {
        public String getId() { return "17"; }
        public String getName() { return "Release 1"; }
        public String getProjectId() { return "VforIA"; }
        public List<Elem> getElements() {
            List<Elem> out = new ArrayList<Elem>();
            for (WidgetHarness.Module m : COLLECTION) { out.add(new Elem(m)); }
            return out;
        }
    }

    public static class Elem {
        final WidgetHarness.Module m;
        Elem(WidgetHarness.Module m) { this.m = m; }
        public String getRevision() { return "1234"; }
        public WidgetHarness.Module getObjectWithRevision() { return m; }
        public WidgetHarness.Module getObject() { return m; }
    }

    public static class ColObj {
        public ColOld getOldApi() { return new ColOld(); }
    }

    public static class ColRef {
        public String projectId() { return "VforIA"; }
        public String id() { return "17"; }
        public String revision() { return null; }
        public ColObj get(Object tx) { return new ColObj(); }
        public String toString() { return "CollectionReference VforIA/17"; }
    }

    public static class Ctx {
        final ColRef ref;
        Ctx(ColRef ref) { this.ref = ref; }
        public ColRef contextCollection() { return ref; }
    }

    public static class Ref {
        final String project, id;
        Ref(String project, String id) { this.project = project; this.id = id; }
        public String projectId() { return project; }
        public String id() { return id; }
        public String revision() { return null; }
    }

    public static class Renderer {
        final String text; boolean col;
        Renderer(String text) { this.text = text; }
        public Renderer withLinks() { return this; }
        public Renderer openLinksInCollectionContext(Object ref) { col = true; return this; }
        public String toString() { return "<a href=\"#/project/VforIA/" + (col ? "collection?id=17&amp;" : "") + "x=" + text + "\">" + text + "</a>"; }
    }

    /** Rendering API object (ProxyDocument / ProxyWorkItem) returned by searchBySql. */
    public static class Proxy {
        final Object old; final String project, id;
        Proxy(WidgetHarness.Module m) { old = m; project = m.project; id = m.getId(); }
        Proxy(WidgetHarness.WorkItem w) { old = w; project = w.getProjectId(); id = w.getId(); }
        public Ref getReference() { return new Ref(project, id); }
        public Object getOldApi() { return old; }
        public Renderer render() { return new Renderer(id); }
    }

    /** A List so that Velocity 1.4 iterates it (the real ProxyModelObjectsSqlSearch iterates on 2512, spike V2). */
    public static class Search extends AbstractList<Proxy> {
        final String sql; Object ref;
        Search(String sql) { this.sql = sql; }
        public Search collection(Object r) { ref = r; return this; }
        public Proxy get(int i) { return run().get(i); }
        public int size() { return run().size(); }
        public Iterator<Proxy> iterator() { return run().iterator(); }

        List<Proxy> run() {
            if (ref == null) { throw new RuntimeException("collection SQL without a collection reference: " + sql); }
            List<Proxy> out = new ArrayList<Proxy>();
            if (sql.contains("col_struct_workitem_linkedworkitems")) {
                Set<String> roles = WidgetHarness.listAfter(sql, "l.c_role in (");
                boolean targets = sql.startsWith("select distinct wt.");
                Set<String> seen = new LinkedHashSet<String>();
                for (WidgetHarness.Module m : COLLECTION) {
                    for (WidgetHarness.WorkItem w : m.items) {
                        for (WidgetHarness.Link l : w.getLinkedWorkItemsStructsDirect()) {
                            WidgetHarness.WorkItem t = l.getLinkedItem();
                            if (!roles.contains(l.getLinkRole().getId()) || t.isUnresolvable() || !COLLECTION.contains(t.getModule())
                                || t.getModule() == m) { continue; }
                            WidgetHarness.WorkItem o = targets ? t : w;
                            if (seen.add(o.getProjectId() + "/" + o.getId())) { out.add(new Proxy(o)); }
                        }
                    }
                }
            } else if (sql.contains("col_workitem w")) {
                Matcher n = Pattern.compile("m[.]c_id = '([^']*)'").matcher(sql);
                n.find();
                Set<String> excluded = WidgetHarness.listAfter(sql, "w.c_type not in (");
                for (WidgetHarness.Module m : COLLECTION) {
                    if (!m.getId().equals(n.group(1))) { continue; }
                    for (WidgetHarness.WorkItem w : m.items) {
                        if (!excluded.contains(w.getType().getId())) { out.add(new Proxy(w)); }
                    }
                }
            } else {
                for (WidgetHarness.Module m : COLLECTION) { out.add(new Proxy(m)); }
            }
            return out;
        }
    }

    public static class Objects {
        public Search searchBySql(String sql) { return new Search(sql); }
    }

    public static class Transaction {
        final Ctx ctx;
        Transaction(ColRef ref) { ctx = new Ctx(ref); }
        public Ctx context() { return ctx; }
        public Objects objects() { return new Objects(); }
    }

    public static class ColModel {
        public ColRef getReference() { return new ColRef(); }
    }

    public static class ColOpt {
        public String id() { return "17"; }
        public ColModel getModelObject() { return new ColModel(); }
    }

    static String run(String dir, String out, String test, boolean inContext, boolean withParam) throws Exception {
        WidgetHarness.TRANSACTION = new Transaction(inContext ? new ColRef() : null);
        List<Object> roles = new ArrayList<Object>();
        roles.add(new WidgetHarness.RoleOpt("duplicates"));
        roles.add(new WidgetHarness.RoleOpt("derived_from"));
        List<Object> cols = new ArrayList<Object>();
        if (withParam) { cols.add(new ColOpt()); }
        Map<String, WidgetHarness.Param> p = new HashMap<String, WidgetHarness.Param>();
        p.put("test", new WidgetHarness.Param(test, null));
        p.put("collection", new WidgetHarness.Param(null, cols));
        p.put("roles", new WidgetHarness.Param(null, roles));
        p.put("excludedTypes", new WidgetHarness.Param("heading", null));
        p.put("sql", new WidgetHarness.Param("select c_uri, c_col_rev from col_module", null));
        p.put("maxRows", new WidgetHarness.Param(Integer.valueOf(30), null));
        String name = test + (inContext ? "" : withParam ? "-param" : "-none");
        String html = WidgetHarness.render(dir, p, false, out + "/velocity-" + name + ".log");
        WidgetHarness.write(out + "/" + name + ".html", "<!doctype html><meta charset=utf-8><body>" + html);
        WidgetHarness.check(!Pattern.compile("(?<![A-Za-z0-9_])[$][!]?[{]?[a-zA-Z]").matcher(html).find(), name + ": no unrendered Velocity reference");
        return html;
    }

    public static void main(String[] args) throws Exception {
        WidgetHarness.buildTestSet();
        COLLECTION.add(mod("SRS_Test"));
        COLLECTION.add(mod("SRS_Test_Reuse_TestB"));
        COLLECTION.add(mod("SRS_Test_TestD_Derived"));
        String dir = args[0];
        String out = args[1];
        String h = run(dir, out, "ctx", true, false);
        WidgetHarness.check(h.contains("<b>page context</b>") && h.contains("17 / Release 1 / VforIA") && !h.contains("class=\"ko\""),
            "ctx: context collection read, Open API collection shown");
        WidgetHarness.check(h.contains("VforIA/Requirements/SRS_Test_Reuse_TestB") && h.contains("3 element(s)"), "ctx: elements listed");
        h = run(dir, out, "ctx", false, false);
        WidgetHarness.check(h.contains("<b>none</b>") && h.contains("No collection context."), "ctx: no context, no parameter");
        h = run(dir, out, "docs", false, false);
        WidgetHarness.check(h.contains("No collection: open the page in a collection"), "docs: no collection, message");
        h = run(dir, out, "docs", false, true);
        WidgetHarness.check(h.contains("<b>collection parameter</b>") && h.contains("<b>3</b> document(s)"), "docs: collection from the parameter (K6)");
        h = run(dir, out, "docs", true, false);
        WidgetHarness.check(h.contains("VforIA/Requirements/SRS_Test_TestD_Derived") && h.contains("collection?id=17"), "docs: documents and collection links");
        h = run(dir, out, "items", true, false);
        WidgetHarness.check(h.contains("VforIA/Requirements/SRS_Test @ </td><td>5</td><td>5</td>"), "items: SRS_Test 5 items (heading excluded), as HEAD");
        h = run(dir, out, "itemsRel", true, false);
        WidgetHarness.check(h.contains("col_rel_module_workitem"), "itemsRel: rel table query");
        h = run(dir, out, "links", true, false);
        WidgetHarness.check(h.contains("VforIA/Requirements/SRS_Test | duplicates | VforIA/Requirements/SRS_Test_Reuse_TestB"), "links: copy pair found");
        WidgetHarness.check(h.contains("VforIA/Requirements/SRS_Test | derived_from | VforIA/Requirements/SRS_Test_TestD_Derived"), "links: derived pair found");
        WidgetHarness.check(!h.contains("SRS_Test_Copy_of_B_TestE"), "links: documents outside the collection ignored");
        h = run(dir, out, "sql", true, false);
        WidgetHarness.check(h.contains("<b>3</b> row(s)"), "sql: custom SQL");
        WidgetHarness.TRANSACTION = null;
    }
}

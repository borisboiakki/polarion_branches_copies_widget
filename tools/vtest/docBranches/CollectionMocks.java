import java.util.*;
import java.util.regex.*;

/**
 * Rendering API collection mocks for the docCoverage and advImpact harnesses, as observed on 2512 (spike tests/docCoverage-v0.3.x):
 * $transaction.context().contextCollection() (null outside a collection and in the PDF export), the reference
 * (projectId(), id(), get(transaction).getOldApi() with getName() / getUpstreamCollections()), and
 * $transaction.objects().searchBySql(sql).collection(ref) on the col_* tables, returning objects whose getOldApi() is
 * the Open API object at the collection revision. A revision is modelled by a separate snapshot module (RevModule,
 * getRevision()) holding its own items and links; HEAD documents of a collection are ordinary modules.
 */
public class CollectionMocks {

    /** Module at a pinned revision; not in WidgetHarness.MODULES, so HEAD SQL never sees it. */
    public static class RevModule extends WidgetHarness.Module {
        final String revision;
        public RevModule(String project, String folder, String name, String revision) {
            super(folder, name, name.replace('_', ' '));
            this.project = project;
            this.revision = revision;
        }
        public String getRevision() { return revision; }
    }

    public static class Named {
        final String name;
        Named(String name) { this.name = name; }
        public String getName() { return name; }
    }

    public static class ColOld {
        final Collection col;
        ColOld(Collection col) { this.col = col; }
        public String getName() { return col.name; }
        public List<Named> getUpstreamCollections() {
            List<Named> out = new ArrayList<Named>();
            for (Collection u : col.upstream) { out.add(new Named(u.name)); }
            return out;
        }
    }

    public static class ColObj {
        final Collection col;
        ColObj(Collection col) { this.col = col; }
        public ColOld getOldApi() { return new ColOld(col); }
    }

    /** Collection with its own documents and upstream collections; also its reference (BaselineCollectionReference). */
    public static class Collection {
        final String project, id, name;
        final List<WidgetHarness.Module> docs = new ArrayList<WidgetHarness.Module>();
        final List<Collection> upstream = new ArrayList<Collection>();
        public Collection(String project, String id, String name) { this.project = project; this.id = id; this.name = name; }
        public String projectId() { return project; }
        public String id() { return id; }
        public ColObj get(Object transaction) { return new ColObj(this); }
        public String toString() { return project + "/" + id + " (null, null)"; }

        List<WidgetHarness.Module> allDocs() {
            List<WidgetHarness.Module> out = new ArrayList<WidgetHarness.Module>(docs);
            for (Collection u : upstream) { out.addAll(u.allDocs()); }
            return out;
        }
    }

    public static class Proxy {
        final Object old;
        Proxy(Object old) { this.old = old; }
        public Object getOldApi() { return old; }
    }

    /** searchBySql(sql).collection(ref): a List so that Velocity 1.4 iterates it. */
    public static class Search extends AbstractList<Proxy> {
        final String sql; Collection ref;
        Search(String sql) { this.sql = sql; }
        public Search collection(Object r) { ref = (Collection) r; return this; }
        public Proxy get(int i) { return run().get(i); }
        public int size() { return run().size(); }
        public Iterator<Proxy> iterator() { return run().iterator(); }

        List<Proxy> run() {
            if (ref == null) { throw new RuntimeException("collection SQL without a collection reference: " + sql); }
            List<WidgetHarness.Module> docs = ref.allDocs();
            List<Proxy> out = new ArrayList<Proxy>();
            if (sql.contains("col_struct_workitem_linkedworkitems")) {
                Set<String> roles = WidgetHarness.listAfter(sql, "l.c_role in (");
                boolean targets = sql.startsWith("select distinct wt.");
                boolean otherDoc = sql.contains("ms.c_uri <> mt.c_uri");
                Set<String> exT = WidgetHarness.listAfter(sql, "wt.c_type not in (");
                Set<String> exS = WidgetHarness.listAfter(sql, "ws.c_type not in (");
                Set<String> seen = new HashSet<String>();
                for (WidgetHarness.Module m : docs) {
                    for (WidgetHarness.WorkItem w : m.items) {
                        for (WidgetHarness.Link l : w.getLinkedWorkItemsStructsDirect()) {
                            WidgetHarness.WorkItem t = l.getLinkedItem();
                            if (!roles.contains(l.getLinkRole().getId()) || t.isUnresolvable() || !docs.contains(t.getModule())
                                || (otherDoc && t.getModule() == m) || exT.contains(t.getType().getId()) || exS.contains(w.getType().getId())) { continue; }
                            WidgetHarness.WorkItem o = targets ? t : w;
                            if (seen.add(o.getProjectId() + "/" + o.getId())) { out.add(new Proxy(o)); }
                        }
                    }
                }
            } else if (sql.startsWith("select w.c_uri, w.c_col_rev from col_workitem w")) {
                Set<String> excluded = WidgetHarness.listAfter(sql, "w.c_type not in (");
                for (WidgetHarness.Module m : docs) {
                    for (WidgetHarness.WorkItem w : m.items) {
                        if (!excluded.contains(w.getType().getId())) { out.add(new Proxy(w)); }
                    }
                }
            } else if (sql.equals("select c_uri, c_col_rev from col_module")) {
                for (WidgetHarness.Module m : docs) { out.add(new Proxy(m)); }
            } else {
                throw new IllegalArgumentException("Unexpected collection SQL: " + sql);
            }
            return out;
        }
    }

    public static class Objects {
        public Search searchBySql(String sql) { return new Search(sql); }
    }

    public static class Ctx {
        final Collection ref;
        Ctx(Collection ref) { this.ref = ref; }
        public Collection contextCollection() { return ref; }
    }

    public static class Transaction {
        final Ctx ctx;
        public Transaction(Collection context) { ctx = new Ctx(context); }
        public Ctx context() { return ctx; }
        public Objects objects() { return new Objects(); }
    }

    /** @collection selector value: ProxyEnumOption -> getModelObject() -> getReference() (spike K6). */
    public static class ColModel {
        final Collection col;
        ColModel(Collection col) { this.col = col; }
        public boolean isUnresolvable() { return false; }
        public Collection getReference() { return col; }
    }

    public static class ColOpt {
        final Collection col;
        public ColOpt(Collection col) { this.col = col; }
        public String id() { return col.id; }
        public ColModel getModelObject() { return new ColModel(col); }
    }
}

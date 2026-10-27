import java.io.*;
import java.text.SimpleDateFormat;
import java.util.*;
import java.util.regex.*;
import org.apache.velocity.Template;
import org.apache.velocity.VelocityContext;
import org.apache.velocity.app.VelocityEngine;
import org.apache.velocity.runtime.RuntimeServices;
import org.apache.velocity.runtime.log.LogSystem;

/**
 * Renders the built widget (widgets/docBranches/dist/docBranches/render.vm) with Velocity 1.4 against mock
 * Polarion objects that reproduce the VforIA spike test set (tests/v0.1.x/spike-tests.md section 0).
 *
 * Usage: java WidgetHarness <widgetDir> <outDir>
 * Writes browser.html and pdf.html (static mode) and velocity.log to outDir.
 *
 * The mocks follow what the spike observed on 2512: customEnum singleValue() is a String,
 * sqlSearch returns object lists, links are stored on the copy/branch/derived item.
 * The mock classes are shared: tools/vtest/docCoverage/CoverageHarness.java and tools/vtest/cvSpike/SpikeHarness.java
 * compile this file with theirs. Selector mocks (DocOpt, RoleOpt, link role enumeration) follow the docCoverage spike
 * C1/C2 on 2512.
 */
public class WidgetHarness {

    // ------------------------------------------------------------------ mock model

    public static class Opt {
        private final String id, name;
        public Opt(String id, String name) { this.id = id; this.name = name; }
        public String getId() { return id; }
        public String getName() { return name; }
        public String toString() { return id; }
    }

    /** Unresolvable objects (deleted user, document without access) throw on any access except isUnresolvable(),
     *  as seen on 2512: "uri: subterra:data-service:objects:/default/${User}t0025088". */
    public static class User {
        private final String id, name; private final boolean unresolvable;
        public User(String id, String name) { this(id, name, false); }
        public User(String id, String name, boolean unresolvable) { this.id = id; this.name = name; this.unresolvable = unresolvable; }
        public boolean isUnresolvable() { return unresolvable; }
        private void check() {
            if (unresolvable) { throw new RuntimeException("uri: subterra:data-service:objects:/default/" + "$" + "{User}" + id); }
        }
        public String getId() { check(); return id; }
        public String getName() { check(); return name; }
    }

    public static class Module {
        final String folder, name, title;
        Module branchedFrom, derivedFrom;
        User author = new User("TESTUSER", "Test User");
        boolean unresolvable;
        final List<WorkItem> items = new ArrayList<WorkItem>();
        public Module(String folder, String name, String title) { this.folder = folder; this.name = name; this.title = title; }
        private void check() {
            if (unresolvable) { throw new RuntimeException("uri: subterra:data-service:objects:/default/" + "$" + "{Module}" + folder + "#" + name); }
        }
        public boolean isUnresolvable() { return unresolvable; }
        public String getId() { check(); return name; }
        public String getModuleFolder() { check(); return folder; }
        public String getTitle() { check(); return title; }
        public Opt getType() { return new Opt("systemReqSpecification", "System Requirement Specification"); }
        public Opt getStatus() { return new Opt("draft", "Draft"); }
        public User getAuthor() { return author; }
        public Date getCreated() { return new Date(1793000000000L); }
        public Date getUpdated() { return new Date(1793090000000L); }
        public Object getValue(String field) {
            if ("branchedFrom".equals(field)) { return branchedFrom; }
            if ("derivedFrom".equals(field)) { return derivedFrom; }
            return null;
        }
        public String toString() { return "Module(" + folder + "/" + name + ")"; }
    }

    public static class Role {
        private final String id;
        public Role(String id) { this.id = id; }
        public String getId() { return id; }
    }

    public static class Link {
        private final Role role; private final WorkItem target;
        public Link(String role, WorkItem target) { this.role = new Role(role); this.target = target; }
        public Role getLinkRole() { return role; }
        public WorkItem getLinkedItem() { return target; }
    }

    public static class WorkItem {
        final String id, type; final Module module;
        boolean unresolvable;
        final List<Link> links = new ArrayList<Link>();
        public WorkItem(String id, String type, Module module) { this.id = id; this.type = type; this.module = module; module.items.add(this); }
        public String getId() { return id; }
        public Opt getType() { return new Opt(type, type); }
        public Module getModule() { return module; }
        public boolean isUnresolvable() { return unresolvable; }
        public List<Link> getLinkedWorkItemsStructsDirect() { return links; }
    }

    static final List<Module> MODULES = new ArrayList<Module>();
    static final Map<String, WorkItem> ITEMS = new LinkedHashMap<String, WorkItem>();
    static int SQL_COUNT = 0;

    static Module doc(String name) {
        Module m = new Module("Requirements", name, name);
        MODULES.add(m);
        return m;
    }

    static WorkItem wi(int n, String type, Module m) {
        WorkItem w = new WorkItem("VIA-" + n, type, m);
        ITEMS.put(w.id, w);
        return w;
    }

    static void link(int from, String role, int to) {
        ITEMS.get("VIA-" + from).links.add(new Link(role, ITEMS.get("VIA-" + to)));
    }

    static void buildTestSet() {
        Module a = doc("SRS_Test");
        Module b = doc("SRS_Test_Reuse_TestB");
        Module c = doc("SRS_Test_Branch_Test_C");
        Module d = doc("SRS_Test_TestD_Derived");
        Module e = doc("SRS_Test_Copy_of_B_TestE");
        Module f = doc("SRS_Test_F_nooverwrite");
        Module g = doc("Test_G_UnrelatedDoc");
        doc("Index");
        doc("Sp <b>&\"quoted'\"");   // escaping check
        // A: 509-513 requirements, 514 heading
        for (int i = 509; i <= 513; i++) { wi(i, "systemRequirement", a); }
        wi(514, "heading", a);
        // B: copy of A (duplicates), 515 heading
        wi(515, "heading", b);
        for (int i = 516; i <= 520; i++) { wi(i, "systemRequirement", b); }
        link(515, "duplicates", 514);
        for (int i = 0; i < 5; i++) { link(516 + i, "duplicates", 509 + i); }
        // C: branch of A, 2 overwritten items, metadata
        wi(521, "heading", c);
        wi(522, "systemRequirement", c);
        wi(523, "systemRequirement", c);
        link(522, "branched_from", 509);
        link(523, "branched_from", 512);
        c.branchedFrom = a;
        // D: derived from A, metadata
        wi(524, "heading", d);
        link(524, "derived_from", 514);
        for (int i = 525; i <= 529; i++) { wi(i, "systemRequirement", d); link(i, "derived_from", i - 16); }
        d.derivedFrom = a;
        // E: copy of B, keeps the inherited links to A
        wi(530, "heading", e);
        for (int i = 531; i <= 535; i++) {
            wi(i, "systemRequirement", e);
            link(i, "duplicates", i - 15);   // -> B
            link(i, "duplicates", i - 22);   // -> A (inherited)
        }
        // F: branch of A, nothing overwritten (metadata only)
        wi(536, "heading", f);
        f.branchedFrom = a;
        // G: unrelated
        wi(537, "systemRequirement", g);
        wi(538, "systemRequirement", g);
        // Unresolvable objects as seen on 2512 (spike on EOLE_AI_MCP_TESTS): a document whose author user was deleted,
        // a branch whose source document cannot be resolved, a link to an unresolvable work item.
        Module ghostAuthor = doc("Ghost_Author_Doc");
        ghostAuthor.author = new User("t0025088", "gone", true);
        WorkItem ga = wi(539, "systemRequirement", ghostAuthor);
        Module orphan = doc("Orphan_Branch");
        Module missing = new Module("Requirements", "Missing_Source", "Missing_Source");
        missing.unresolvable = true;
        orphan.branchedFrom = missing;
        orphan.derivedFrom = missing;
        WorkItem ghostItem = new WorkItem("VIA-999", "systemRequirement", g);
        ghostItem.unresolvable = true;
        ga.links.add(new Link("duplicates", ghostItem));
        for (WorkItem w : ITEMS.values()) { w.links.add(new Link("parent", w)); }
    }

    // ------------------------------------------------------------------ mock services

    public static class DataService {
        public List<Object> sqlSearch(String sql) {
            SQL_COUNT++;
            List<Object> out = new ArrayList<Object>();
            Set<String> excluded = listAfter(sql, "c_type NOT IN (");
            if (sql.startsWith("SELECT m.c_uri FROM module m")) {
                out.addAll(MODULES);
            } else if (sql.startsWith("SELECT w.c_uri FROM workitem w")) {
                String folder = quoted(sql, "m.c_modulefolder = '");
                String name = quoted(sql, "m.c_id = '");
                for (WorkItem w : ITEMS.values()) {
                    if (w.module.folder.equals(folder) && w.module.name.equals(name) && !excluded.contains(w.type)) { out.add(w); }
                }
            } else if (sql.startsWith("SELECT DISTINCT ws.c_uri")) {
                Set<String> roles = listAfter(sql, "l.c_role IN (");
                for (WorkItem w : ITEMS.values()) {
                    if (excluded.contains(w.type)) { continue; }
                    for (Link l : w.links) {
                        if (roles.contains(l.role.getId()) && l.target.module != w.module) { out.add(w); break; }
                    }
                }
            } else {
                throw new IllegalArgumentException("Unexpected SQL: " + sql);
            }
            return out;
        }
    }

    static String quoted(String sql, String prefix) {
        int i = sql.indexOf(prefix);
        if (i < 0) { return null; }
        StringBuilder sb = new StringBuilder();
        for (int j = i + prefix.length(); j < sql.length(); j++) {
            char ch = sql.charAt(j);
            if (ch == '\'') {
                if (j + 1 < sql.length() && sql.charAt(j + 1) == '\'') { sb.append('\''); j++; continue; }
                break;
            }
            sb.append(ch);
        }
        return sb.toString();
    }

    static Set<String> listAfter(String sql, String prefix) {
        Set<String> out = new HashSet<String>();
        int i = sql.indexOf(prefix);
        if (i < 0) { return out; }
        int j = sql.indexOf(')', i);
        Matcher m = Pattern.compile("'([^']*)'").matcher(sql.substring(i, j));
        while (m.find()) { out.add(m.group(1)); }
        return out;
    }

    // @document selector value (spike C1): ProxyEnumOption -> getModelObject() ProxyDocument -> getOldApi() Module.
    // getReference().spaceId() is empty on 2512.
    public static class DocRef {
        final Module m;
        DocRef(Module m) { this.m = m; }
        public String projectId() { return "VforIA"; }
        public String spaceId() { return ""; }
        public String name() { return m.getId(); }
    }

    public static class Doc {
        final Module m;
        Doc(Module m) { this.m = m; }
        public boolean isUnresolvable() { return m.unresolvable; }
        public DocRef getReference() { return new DocRef(m); }
        public Module getOldApi() { return m; }
    }

    public static class DocOpt {
        final Module m;
        public DocOpt(Module m) { this.m = m; }
        public String id() { return m.folder + " / " + m.name; }
        public Doc getModelObject() { return new Doc(m); }
        public String toString() { return "ProxyEnumOption id:" + id(); }
    }

    // workitem-link-role selector value (spike C2): id() = role id.
    public static class RoleOpt {
        final String id;
        public RoleOpt(String id) { this.id = id; }
        public String id() { return id; }
        public String toString() { return "ProxyEnumOption id:" + id; }
    }

    // Project link role enumeration: id, name, opposite name (spike C2).
    public static class RoleEnumOpt {
        final String id, name, opposite;
        public RoleEnumOpt(String id, String name, String opposite) { this.id = id; this.name = name; this.opposite = opposite; }
        public String getId() { return id; }
        public String getName() { return name; }
        public String getOppositeName() { return opposite; }
    }

    static final List<RoleEnumOpt> LINK_ROLES = new ArrayList<RoleEnumOpt>(Arrays.asList(
        new RoleEnumOpt("parent", "has parent", "is parent of"),
        new RoleEnumOpt("satisfies", "satisfies", "is satisfied by"),
        new RoleEnumOpt("verifies", "verifies", "is verified by"),
        new RoleEnumOpt("duplicates", "duplicates", "is duplicated by"),
        new RoleEnumOpt("derived_from", "is derived from", "is derived by"),
        new RoleEnumOpt("branched_from", "is branched from", "has branch")));

    public static class RoleEnum {
        public List<RoleEnumOpt> getAllOptions() { return LINK_ROLES; }
    }

    public static class TrackerProject {
        public RoleEnum getWorkItemLinkRoleEnum() { return new RoleEnum(); }
    }

    public static class TrackerService {
        private final DataService ds = new DataService();
        public DataService getDataService() { return ds; }
        public TrackerProject getTrackerProject(String projectId) { return new TrackerProject(); }
    }

    public static class ObjectFactory {
        public Map<Object, Object> newMap() { return new HashMap<Object, Object>(); }
    }

    public static class Esc {
        public String getD() { return "$"; }
        public String html(Object o) {
            if (o == null) { return null; }
            return o.toString().replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;");
        }
    }

    public static class DateTool {
        public String format(String fmt, Object d) { return new SimpleDateFormat(fmt).format((Date) d); }
        public long getSystemTime() { return System.currentTimeMillis(); }
    }

    public static class Ref {
        public String projectId() { return "VforIA"; }
    }

    public static class Page {
        public Ref getReference() { return new Ref(); }
    }

    public static class Target {
        private final boolean pdf;
        public Target(boolean pdf) { this.pdf = pdf; }
        public boolean isPdf() { return pdf; }
        public boolean isPrint() { return false; }
        public boolean isEditor() { return false; }
    }

    public static class WidgetContext {
        private final Target t;
        public WidgetContext(boolean pdf) { t = new Target(pdf); }
        public Target target() { return t; }
    }

    /** Parameter object: only method-style accessors, like the API observed on 2512. */
    public static class Param {
        private final Object value;
        private final List<Object> values;
        public Param(Object value, List<Object> values) { this.value = value; this.values = values; }
        public Object value() { return value; }
        public Object singleValue() { return value; }
        public List<Object> values() { return values; }
    }

    /** Collects Velocity log messages (invalid references, method errors) into a file. */
    public static class FileLog implements LogSystem {
        private final PrintWriter out;
        public FileLog(String file) throws IOException { out = new PrintWriter(new FileWriter(file)); }
        public void init(RuntimeServices rs) { }
        public void logVelocityMessage(int level, String message) {
            String[] names = { "DEBUG", "INFO", "WARN", "ERROR" };
            out.println((level >= 0 && level < 4 ? names[level] : "L" + level) + " " + message);
            out.flush();
        }
    }

    // ------------------------------------------------------------------ run

    static String render(String widgetDir, Map<String, Param> params, boolean pdf, String logFile) throws Exception {
        VelocityEngine ve = new VelocityEngine();
        ve.setProperty("file.resource.loader.path", widgetDir);
        ve.setProperty("runtime.log.logsystem", new FileLog(logFile));
        ve.init();
        VelocityContext ctx = new VelocityContext();
        ctx.put("parameters", params);
        ctx.put("page", new Page());
        ctx.put("widgetContext", new WidgetContext(pdf));
        ctx.put("trackerService", new TrackerService());
        ctx.put("objectFactory", new ObjectFactory());
        ctx.put("esc", new Esc());
        ctx.put("date", new DateTool());
        Template t = ve.getTemplate("render.vm", "UTF-8");
        StringWriter w = new StringWriter();
        t.merge(ctx, w);
        return w.toString();
    }

    static void write(String file, String text) throws IOException {
        Writer w = new OutputStreamWriter(new FileOutputStream(file), "UTF-8");
        w.write(text);
        w.close();
    }

    static void check(boolean ok, String what) {
        if (!ok) { System.err.println("CHECK FAILED: " + what); System.exit(1); }
        System.out.println("check ok: " + what);
    }

    public static void main(String[] args) throws Exception {
        buildTestSet();
        String widgetDir = args[0];
        String outDir = args[1];
        Map<String, Param> params = new HashMap<String, Param>();
        params.put("copyLinkRoles", new Param(null, new ArrayList<Object>(Arrays.asList(new RoleOpt("duplicates")))));
        params.put("branchLinkRoles", new Param(null, new ArrayList<Object>(Arrays.asList(new RoleOpt("branched_from")))));
        params.put("derivedLinkRoles", new Param(null, new ArrayList<Object>(Arrays.asList(new RoleOpt("derived_from")))));
        params.put("excludedTypes", new Param(null, new ArrayList<Object>(Arrays.asList(new RoleOpt("heading")))));
        params.put("spaces", new Param("", null));
        params.put("showMode", new Param(args.length > 2 ? args[2] : "related", null));
        params.put("showIndirect", new Param("hide", null));
        params.put("extraFields", new Param(null, new ArrayList<Object>(Arrays.asList("items", "status"))));
        params.put("lineCounts", new Param("show", null));
        params.put("relationKinds", new Param(null, new ArrayList<Object>()));
        params.put("threshold", new Param(Integer.valueOf(1), null));
        params.put("height", new Param(Integer.valueOf(560), null));
        String browser = render(widgetDir, params, false, outDir + "/velocity-browser.log");
        write(outDir + "/browser-fragment.html", browser);
        check(browser.contains("data-id=\"Ghost_Author_Doc\"") && !browser.contains("unknown user") && !browser.contains("data-author"),
            "document with a deleted author is listed (the author field was removed)");
        check(browser.contains("data-kc=\"5\""), "link roles read from the selectors (copy relations found)");
        check(!browser.contains("Missing_Source"), "unresolvable source documents are ignored");
        check(!browser.contains("VIA-999"), "links to unresolvable work items are ignored");
        check(browser.contains("data-o=\"Requirements/SRS_Test\" data-c=\"Requirements/SRS_Test_Branch_Test_C\""),
            "normal relations are still found");
        int sqlBrowser = SQL_COUNT;
        String pdf = render(widgetDir, params, true, outDir + "/velocity-pdf.log");
        write(outDir + "/pdf-fragment.html", pdf);
        // No copy role selected: no copy relation; no role at all: message.
        params.put("copyLinkRoles", new Param(null, new ArrayList<Object>()));
        String noCopy = render(widgetDir, params, false, outDir + "/velocity-nocopy.log");
        check(!noCopy.contains("data-kc=\"5\"") && noCopy.contains("data-kb=\"2\""), "empty copy role selector: no copy relation, branches kept");
        params.put("branchLinkRoles", new Param(null, new ArrayList<Object>()));
        params.put("derivedLinkRoles", new Param(null, null));
        String noRole = render(widgetDir, params, false, outDir + "/velocity-norole.log");
        check(noRole.contains("select at least one link role"), "no link role selected: message");
        System.out.println("Rendered: browser " + browser.length() + " chars, pdf " + pdf.length() + " chars, SQL queries per render " + sqlBrowser);
    }
}

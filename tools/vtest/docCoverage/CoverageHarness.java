import java.util.*;

/**
 * Renders the built docCoverage widget (widgets/docCoverage/dist/docCoverage/render.vm) with Velocity 1.4 against the
 * mock Polarion objects of tools/vtest/docBranches/WidgetHarness.java, on a coverage test set:
 *
 *   Specs/CustomerSpec  VIA-1..6 requirements, VIA-7 heading           (upstream)
 *   _default/SysReq_A   VIA-11..14: 11 satisfies 1, 12 satisfies 2, 13 satisfies 2, 14 verifies 3, 13 satisfies 7 (heading)
 *   _default/SysReq_B   VIA-21..23: 21 satisfies 3, 22 satisfies 4, 22 satisfies 1, 23 satisfies an unresolvable item
 *   _default/SwReq_C    VIA-31..32: 31 satisfies 11, 32 satisfies 12   (chain C -> A -> CustomerSpec)
 *   _default/Other      VIA-41: 41 satisfies 5                         (not selected)
 *   CustomerSpec        VIA-1 satisfies 2                              (same document, ignored)
 *   VforIB: _default/SysReq_X  VIB-1 satisfies VIA-5                   (other project, only with both projects selected)
 *   VforIB: _default/SysReq_Y  VIB-2 satisfies VIA-1                   (other project, left out by "Documents of other projects")
 *
 * Expected with CustomerSpec, SysReq_A, SysReq_B, SwReq_C selected and roles satisfies + verifies:
 *   CustomerSpec covered {1,2,3,4} = 4/6 (67%), uncovered VIA-5, VIA-6; SysReq_A covered {11,12} = 2/4 (50%).
 *
 * Usage: java CoverageHarness <widgetDir> <outDir>   (writes browser-fragment.html, pdf-fragment.html, logs)
 */
public class CoverageHarness {

    static WidgetHarness.Module mod(String folder, String name) {
        WidgetHarness.Module m = new WidgetHarness.Module(folder, name, name.replace('_', ' '));
        WidgetHarness.MODULES.add(m);
        return m;
    }

    static WidgetHarness.Module spec, a, b, c, other, x;

    static void buildTestSet() {
        spec = mod("Specs", "CustomerSpec");
        a = mod("_default", "SysReq_A");
        b = mod("_default", "SysReq_B");
        c = mod("_default", "SwReq_C");
        other = mod("_default", "Other");
        for (int i = 1; i <= 6; i++) { WidgetHarness.wi(i, "customerRequirement", spec); }
        WidgetHarness.wi(7, "heading", spec);
        for (int i = 11; i <= 14; i++) { WidgetHarness.wi(i, "systemRequirement", a); }
        for (int i = 21; i <= 23; i++) { WidgetHarness.wi(i, "systemRequirement", b); }
        for (int i = 31; i <= 32; i++) { WidgetHarness.wi(i, "softwareRequirement", c); }
        WidgetHarness.wi(41, "systemRequirement", other);
        WidgetHarness.link(11, "satisfies", 1);
        WidgetHarness.link(12, "satisfies", 2);
        WidgetHarness.link(13, "satisfies", 2);
        WidgetHarness.link(14, "verifies", 3);
        WidgetHarness.link(13, "satisfies", 7);
        WidgetHarness.link(21, "satisfies", 3);
        WidgetHarness.link(22, "satisfies", 4);
        WidgetHarness.link(22, "satisfies", 1);
        WidgetHarness.WorkItem ghost = new WidgetHarness.WorkItem("VIA-999", "customerRequirement", spec);
        spec.items.remove(ghost);
        ghost.unresolvable = true;
        WidgetHarness.ITEMS.get("VIA-23").links.add(new WidgetHarness.Link("satisfies", ghost));
        WidgetHarness.link(31, "satisfies", 11);
        WidgetHarness.link(32, "satisfies", 12);
        WidgetHarness.link(41, "satisfies", 5);
        WidgetHarness.link(1, "satisfies", 2);
        WidgetHarness.link(12, "parent", 11);
        WidgetHarness.ITEMS.get("VIA-12").title = "Satisfies 2 | with; separators";
        x = WidgetHarness.doc("VforIB", "_default", "SysReq_X");
        WidgetHarness.wi("VIB-1", "systemRequirement", x).links.add(new WidgetHarness.Link("satisfies", WidgetHarness.ITEMS.get("VIA-5")));
        WidgetHarness.Module y = WidgetHarness.doc("VforIB", "_default", "SysReq_Y");
        WidgetHarness.wi("VIB-2", "systemRequirement", y).links.add(new WidgetHarness.Link("satisfies", WidgetHarness.ITEMS.get("VIA-1")));
    }

    static Map<String, WidgetHarness.Param> params(List<Object> docs, List<Object> roles) {
        Map<String, WidgetHarness.Param> p = new HashMap<String, WidgetHarness.Param>();
        p.put("docs", new WidgetHarness.Param(null, docs));
        p.put("roles", new WidgetHarness.Param(null, roles));
        p.put("excludedTypes", new WidgetHarness.Param(null, list(new WidgetHarness.RoleOpt("heading"))));
        p.put("spaces", new WidgetHarness.Param("", null));
        p.put("showMode", new WidgetHarness.Param("related", null));
        p.put("lineCounts", new WidgetHarness.Param("show", null));
        p.put("extraFields", new WidgetHarness.Param(null, new ArrayList<Object>(Arrays.asList("items"))));
        p.put("height", new WidgetHarness.Param(Integer.valueOf(520), null));
        return p;
    }

    static List<Object> list(Object... o) { return new ArrayList<Object>(Arrays.asList(o)); }

    public static void main(String[] args) throws Exception {
        buildTestSet();
        String dir = args[0];
        String out = args[1];
        List<Object> docs = list(new WidgetHarness.DocOpt(spec), new WidgetHarness.DocOpt(a), new WidgetHarness.DocOpt(b), new WidgetHarness.DocOpt(c));
        List<Object> roles = list(new WidgetHarness.RoleOpt("satisfies"), new WidgetHarness.RoleOpt("verifies"));

        String br = WidgetHarness.render(dir, params(docs, roles), false, out + "/velocity-browser.log");
        WidgetHarness.write(out + "/browser-fragment.html", br);
        WidgetHarness.check(br.contains("data-roles=\"satisfies|satisfies|is satisfied by;verifies|verifies|is verified by\""), "roles with their names and opposite names are passed to the page");
        WidgetHarness.check(br.contains("data-it=\"VIA-1|Title VIA-1;") && br.contains("VIA-6|Title VIA-6;\"") && !br.contains("VIA-7|"),
            "matrix: work items with titles of the related documents (excluded type left out)");
        WidgetHarness.check(br.contains("VIA-12|Satisfies 2   with  separators"), "matrix: separators in titles replaced");
        WidgetHarness.check(br.contains("data-c=\"VforIA/_default/SysReq_A\"") && br.contains("data-s=\"VIA-11|VIA-1|satisfies;VIA-12|VIA-2|satisfies;VIA-13|VIA-2|satisfies;VIA-14|VIA-3|verifies;\""),
            "matrix: all link pairs of a relation in the page model");
        WidgetHarness.check(br.contains("data-k=\"VforIA/Specs/CustomerSpec\"") && !br.contains("data-k=\"VforIA/_default/Other\"")
            && !br.contains("VforIB"), "only the selected documents of the current project are listed");
        WidgetHarness.check(br.contains("data-o=\"VforIA/Specs/CustomerSpec\" data-c=\"VforIA/_default/SysReq_A\" data-r=\"satisfies:3;verifies:1\""), "SysReq_A -> CustomerSpec: 3 satisfies + 1 verifies (heading target ignored)");
        WidgetHarness.check(br.contains("data-o=\"VforIA/Specs/CustomerSpec\" data-c=\"VforIA/_default/SysReq_B\" data-r=\"satisfies:3;verifies:0\""), "SysReq_B -> CustomerSpec: 3 links (unresolvable target ignored)");
        WidgetHarness.check(br.contains("data-o=\"VforIA/_default/SysReq_A\" data-c=\"VforIA/_default/SwReq_C\""), "chain SwReq_C -> SysReq_A found");
        WidgetHarness.check(!br.contains("data-o=\"VforIA/Specs/CustomerSpec\" data-c=\"VforIA/Specs/CustomerSpec\""), "links inside one document ignored");
        WidgetHarness.check(br.contains("data-items=\"6\" data-rev=\"\" data-up=\"1\" data-cov=\"4\" data-unc-n=\"2\" data-unc=\"VIA-5 VIA-6\""), "CustomerSpec coverage 4/6, uncovered VIA-5 VIA-6");
        WidgetHarness.check(br.contains("data-items=\"4\" data-rev=\"\" data-up=\"1\" data-cov=\"2\""), "SysReq_A coverage 2/4");

        String pdf = WidgetHarness.render(dir, params(docs, roles), true, out + "/velocity-pdf.log");
        WidgetHarness.write(out + "/pdf-fragment.html", pdf);
        WidgetHarness.check(pdf.contains("Coverage: 67% (4/6)") && !pdf.contains("<script"), "PDF: static graph with coverage, no script");
        WidgetHarness.check(pdf.contains("VIA-5, VIA-6"), "PDF: uncovered items listed");

        // No excluded type selected: headings are counted (link to the heading VIA-7, 7 items).
        Map<String, WidgetHarness.Param> allTypes = params(docs, roles);
        allTypes.put("excludedTypes", new WidgetHarness.Param(null, list()));
        String typesAll = WidgetHarness.render(dir, allTypes, false, out + "/velocity-alltypes.log");
        WidgetHarness.check(typesAll.contains("data-c=\"VforIA/_default/SysReq_A\" data-r=\"satisfies:4;verifies:1\"") && typesAll.contains("data-items=\"7\""),
            "no excluded type selected: headings counted");
        // Two projects: the document selection limits the current project only; SysReq_X of VforIB covers VIA-5 (5/6).
        Map<String, WidgetHarness.Param> two = params(docs, roles);
        two.put("projects", new WidgetHarness.Param(null, list(new WidgetHarness.RoleOpt("VforIA"), new WidgetHarness.RoleOpt("VforIB"))));
        String multi = WidgetHarness.render(dir, two, false, out + "/velocity-multi.log");
        WidgetHarness.write(out + "/multi-fragment.html", multi);
        WidgetHarness.check(multi.contains("data-o=\"VforIA/Specs/CustomerSpec\" data-c=\"VforIB/_default/SysReq_X\" data-r=\"satisfies:1;verifies:0\"")
            && !multi.contains("data-k=\"VforIA/_default/Other\""), "two projects: cross-project coverage, selection kept for the current project");
        WidgetHarness.check(multi.contains("data-cov=\"5\" data-unc-n=\"1\" data-unc=\"VIA-6\"") && multi.contains(">Projects: VforIA, VforIB<"),
            "two projects: CustomerSpec coverage 5/6, scope shown");
        String multiPdf = WidgetHarness.render(dir, two, true, out + "/velocity-multipdf.log");
        WidgetHarness.check(multiPdf.contains("<td>VforIB / _default / SysReq_X</td>") && multiPdf.contains("Projects: VforIA, VforIB &mdash;"),
            "two projects, PDF: project in labels and header");
        WidgetHarness.check(multi.contains("data-c=\"VforIB/_default/SysReq_Y\""), "two projects, no other documents listed: all documents of VforIB");
        // Documents of other projects: only SysReq_X of VforIB; the short form project/document means the default space.
        two.put("otherDocs", new WidgetHarness.Param(" VforIB / SysReq_X ", null));
        String listed = WidgetHarness.render(dir, two, false, out + "/velocity-otherdocs.log");
        WidgetHarness.check(listed.contains("data-c=\"VforIB/_default/SysReq_X\"") && !listed.contains("SysReq_Y") && listed.contains("data-cov=\"5\""),
            "documents of other projects: only the listed document of VforIB");
        // An entry of the current project adds to the selection; bad, unselected and unknown entries are reported.
        two.put("otherDocs", new WidgetHarness.Param("VforIA/_default/Other, nonsense, VforIC/_default/Z, VforIB/_default/Nope, VforIB/_default/SysReq_X", null));
        String mixed = WidgetHarness.render(dir, two, false, out + "/velocity-othermixed.log");
        WidgetHarness.check(mixed.contains("data-k=\"VforIA/_default/Other\"") && !mixed.contains("SysReq_Y")
            && mixed.contains("1 entries of Documents of other projects could not be read")
            && mixed.contains("Documents of other projects ignored, project not selected: VforIC.")
            && mixed.contains("Documents of other projects not found: VforIB/_default/Nope."),
            "documents of other projects: current-project entry added, bad / unselected / unknown entries reported");
        two.remove("otherDocs");
        two.put("projects", new WidgetHarness.Param(null, list(new WidgetHarness.RoleOpt("VforIB"))));
        String notCur = WidgetHarness.render(dir, two, false, out + "/velocity-notcur.log");
        WidgetHarness.check(notCur.contains("which is not in the selected projects: they are ignored."), "selected documents outside the scope: warning");
        // No document selected = all documents (Other appears).
        String all = WidgetHarness.render(dir, params(list(), list(new WidgetHarness.RoleOpt("satisfies"))), false, out + "/velocity-all.log");
        WidgetHarness.check(all.contains("data-c=\"VforIA/_default/Other\""), "no document selected: all documents");
        // More than 5 roles: first 5 used, warning.
        List<Object> six = list(new WidgetHarness.RoleOpt("satisfies"), new WidgetHarness.RoleOpt("verifies"), new WidgetHarness.RoleOpt("parent"),
            new WidgetHarness.RoleOpt("duplicates"), new WidgetHarness.RoleOpt("derived_from"), new WidgetHarness.RoleOpt("branched_from"));
        String many = WidgetHarness.render(dir, params(docs, six), false, out + "/velocity-six.log");
        WidgetHarness.check(many.contains("Only the first 5 link roles are used (1 ignored).") && !many.contains("branched_from|"), "more than 5 roles: warning, first 5 used");
        // An unreadable selected document and no role at all.
        WidgetHarness.Module gone = new WidgetHarness.Module("_default", "Gone", "Gone");
        gone.unresolvable = true;
        String lost = WidgetHarness.render(dir, params(list(new WidgetHarness.DocOpt(spec), new WidgetHarness.DocOpt(gone), new WidgetHarness.DocOpt(a)), roles), false, out + "/velocity-lost.log");
        WidgetHarness.check(lost.contains("1 selected document(s) could not be read."), "unreadable selected document reported");
        String none = WidgetHarness.render(dir, params(docs, list()), false, out + "/velocity-none.log");
        WidgetHarness.check(none.contains("select at least one link role"), "no role: message");
        collectionChecks(dir, out, docs, roles);
        System.out.println("Rendered: browser " + br.length() + " chars, pdf " + pdf.length() + " chars");
    }

    /**
     * Collection "Release 1" (VforIA/7), upstream collection "Base":
     *   CustomerSpec @100  VIA-1..5 + heading VIA-7 (VIA-6 only in HEAD)
     *   SysReq_A @101      VIA-11 satisfies 1, 12 satisfies 2, 13 satisfies 5 (HEAD: 13 satisfies 2), 14 verifies 3
     *   SysReq_B @90       (upstream collection) VIA-21 satisfies 3; VIA-22, VIA-23 without links
     *   VforIB SysReq_Z    no pinned revision (HEAD): VIB-5 satisfies VIA-5
     * SwReq_C and Other are not in the collection. Expected: CustomerSpec 4/5 covered, uncovered VIA-4.
     */
    static void collectionChecks(String dir, String out, List<Object> docs, List<Object> roles) throws Exception {
        CollectionMocks.Collection col = new CollectionMocks.Collection("VforIA", "7", "Release 1");
        CollectionMocks.Collection base = new CollectionMocks.Collection("VforIA", "2", "Base");
        col.upstream.add(base);
        CollectionMocks.RevModule specR = new CollectionMocks.RevModule("VforIA", "Specs", "CustomerSpec", "100");
        CollectionMocks.RevModule aR = new CollectionMocks.RevModule("VforIA", "_default", "SysReq_A", "101");
        CollectionMocks.RevModule bR = new CollectionMocks.RevModule("VforIA", "_default", "SysReq_B", "90");
        WidgetHarness.Module z = new WidgetHarness.Module("_default", "SysReq_Z", "SysReq Z");
        z.project = "VforIB";
        Map<Integer, WidgetHarness.WorkItem> r = new HashMap<Integer, WidgetHarness.WorkItem>();
        for (int i = 1; i <= 5; i++) { r.put(i, new WidgetHarness.WorkItem("VIA-" + i, "customerRequirement", specR)); }
        r.put(7, new WidgetHarness.WorkItem("VIA-7", "heading", specR));
        for (int i = 11; i <= 14; i++) { r.put(i, new WidgetHarness.WorkItem("VIA-" + i, "systemRequirement", aR)); }
        r.get(1).title = "Pinned title 1";
        for (int i = 21; i <= 23; i++) { r.put(i, new WidgetHarness.WorkItem("VIA-" + i, "systemRequirement", bR)); }
        r.get(11).links.add(new WidgetHarness.Link("satisfies", r.get(1)));
        r.get(12).links.add(new WidgetHarness.Link("satisfies", r.get(2)));
        r.get(13).links.add(new WidgetHarness.Link("satisfies", r.get(5)));
        r.get(13).links.add(new WidgetHarness.Link("satisfies", r.get(7)));
        r.get(14).links.add(new WidgetHarness.Link("verifies", r.get(3)));
        r.get(21).links.add(new WidgetHarness.Link("satisfies", r.get(3)));
        new WidgetHarness.WorkItem("VIB-5", "systemRequirement", z).links.add(new WidgetHarness.Link("satisfies", r.get(5)));
        col.docs.add(specR);
        col.docs.add(aR);
        col.docs.add(z);
        base.docs.add(bR);

        WidgetHarness.TRANSACTION = new CollectionMocks.Transaction(col);
        String cb = WidgetHarness.render(dir, params(docs, roles), false, out + "/velocity-collection.log");
        WidgetHarness.write(out + "/collection-fragment.html", cb);
        WidgetHarness.check(cb.contains("data-col=\"VforIA/7\"") && cb.contains(">Collection: Release 1 (with upstream: Base)<"),
            "collection: context read, collection and upstream on the scope line");
        WidgetHarness.check(cb.contains("data-k=\"VforIA/Specs/CustomerSpec\" data-p=\"VforIA\"") && cb.contains("data-items=\"5\" data-rev=\"100\" data-up=\"1\" data-cov=\"4\" data-unc-n=\"1\" data-unc=\"VIA-4\""),
            "collection: CustomerSpec at its revision (5 items), coverage 4/5, uncovered VIA-4");
        WidgetHarness.check(cb.contains("data-it=\"VIA-1|Pinned title 1;"), "collection: matrix titles at the pinned revision");
        java.util.regex.Matcher ae = java.util.regex.Pattern.compile("data-o=\"VforIA/Specs/CustomerSpec\" data-c=\"VforIA/_default/SysReq_A\" data-r=\"satisfies:3;verifies:1\" data-u=\"satisfies:([^;]*);").matcher(cb);
        WidgetHarness.check(ae.find() && ae.group(1).contains("VIA-5") && !ae.group(1).contains("VIA-7"),
            "collection: links of the pinned revision (VIA-13 satisfies VIA-5), heading target ignored");
        WidgetHarness.check(cb.contains("data-c=\"VforIA/_default/SysReq_B\" data-r=\"satisfies:1;verifies:0\"") && cb.contains("data-rev=\"90\""),
            "collection: document of the upstream collection included");
        WidgetHarness.check(cb.contains("data-c=\"VforIB/_default/SysReq_Z\" data-r=\"satisfies:1;verifies:0\"") && cb.contains("data-rev=\"HEAD\"")
            && cb.contains("data-projects=\"VforIA,VforIB\""), "collection: document of another project without revision = HEAD");
        WidgetHarness.check(!cb.contains("SwReq_C") && !cb.contains("_default/Other"), "collection: documents outside the collection ignored");
        WidgetHarness.check(cb.contains("In a collection the Projects and Documents parameters are not used."), "collection: selection parameters reported as unused");

        // PDF export: no context, the parameter "Collection" gives the collection.
        WidgetHarness.TRANSACTION = new CollectionMocks.Transaction(null);
        Map<String, WidgetHarness.Param> pp = params(list(), roles);
        pp.put("collection", new WidgetHarness.Param(null, list(new CollectionMocks.ColOpt(col))));
        String cp = WidgetHarness.render(dir, pp, true, out + "/velocity-collectionpdf.log");
        WidgetHarness.check(cp.contains("Collection: Release 1 (with upstream: Base) &mdash;") && cp.contains("Coverage: 80% (4/5)")
            && cp.contains("<td>VforIB / _default / SysReq_Z (HEAD)</td>") && cp.contains("_default  (HEAD)"),
            "collection PDF: collection from the parameter, coverage 4/5, HEAD document marked");
        // Mode "ignore": current documents even in a collection.
        WidgetHarness.TRANSACTION = new CollectionMocks.Transaction(col);
        Map<String, WidgetHarness.Param> ig = params(docs, roles);
        ig.put("collectionMode", new WidgetHarness.Param("ignore", null));
        String ign = WidgetHarness.render(dir, ig, false, out + "/velocity-collectionignore.log");
        WidgetHarness.check(ign.contains("data-col=\"\"") && ign.contains("data-items=\"6\" data-rev=\"\" data-up=\"1\" data-cov=\"4\" data-unc-n=\"2\""),
            "collection context ignored: current documents (HEAD)");
        WidgetHarness.TRANSACTION = null;
    }
}

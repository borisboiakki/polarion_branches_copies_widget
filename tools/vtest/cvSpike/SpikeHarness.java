import java.util.*;

/**
 * Smoke test of the docCoverage spike widget (tests/docCoverage-v0.1.x/spike-widget/cvSpike) with Velocity 1.4,
 * reusing the mock Polarion objects of tools/vtest/docBranches/WidgetHarness.java (VforIA test set).
 * The selector mocks (WidgetHarness.DocOpt, RoleOpt) follow what C1/C2 showed on 2512.
 * Usage: java SpikeHarness <spikeWidgetDir> <outDir>
 */
public class SpikeHarness {

    static WidgetHarness.Module mod(String name) {
        for (WidgetHarness.Module m : WidgetHarness.MODULES) { if (m.getId().equals(name)) { return m; } }
        throw new IllegalArgumentException(name);
    }

    public static void main(String[] args) throws Exception {
        WidgetHarness.buildTestSet();
        String dir = args[0];
        String out = args[1];
        List<Object> docs = new ArrayList<Object>();
        docs.add(new WidgetHarness.DocOpt(mod("SRS_Test")));
        docs.add(new WidgetHarness.DocOpt(mod("SRS_Test_Reuse_TestB")));
        docs.add(new WidgetHarness.DocOpt(mod("SRS_Test_TestD_Derived")));
        List<Object> roles = new ArrayList<Object>();
        roles.add(new WidgetHarness.RoleOpt("duplicates"));
        roles.add(new WidgetHarness.RoleOpt("derived_from"));
        String[] tests = { "docs", "roles", "scan", "coverage" };
        for (String t : tests) {
            Map<String, WidgetHarness.Param> p = new HashMap<String, WidgetHarness.Param>();
            p.put("test", new WidgetHarness.Param(t, null));
            p.put("docs", new WidgetHarness.Param(null, docs));
            p.put("roles", new WidgetHarness.Param(null, roles));
            p.put("rolesText", new WidgetHarness.Param("", null));
            p.put("excludedTypes", new WidgetHarness.Param("heading", null));
            p.put("maxRows", new WidgetHarness.Param(Integer.valueOf(50), null));
            String html = WidgetHarness.render(dir, p, false, out + "/velocity-" + t + ".log");
            WidgetHarness.write(out + "/" + t + ".html", "<!doctype html><meta charset=utf-8><body>" + html);
            WidgetHarness.check(!html.contains("class=\"ko\""), t + ": no error message");
            WidgetHarness.check(!java.util.regex.Pattern.compile("[$][!]?[{]?[a-z]").matcher(html).find(), t + ": no unrendered Velocity reference");
            if (t.equals("docs")) {
                WidgetHarness.check(html.contains("Requirements/SRS_Test_Reuse_TestB"), "docs: selected documents resolved to keys");
            } else if (t.equals("scan")) {
                WidgetHarness.check(html.contains("Requirements/SRS_Test | duplicates | Requirements/SRS_Test_Reuse_TestB"), "scan: copy pair found");
                WidgetHarness.check(html.contains("Requirements/SRS_Test | derived_from | Requirements/SRS_Test_TestD_Derived"), "scan: derived pair found");
                WidgetHarness.check(!html.contains("SRS_Test_Copy_of_B_TestE"), "scan: unselected documents ignored");
            } else if (t.equals("coverage")) {
                // SRS_Test: 5 requirements (heading excluded), all linked from B and D
                WidgetHarness.check(html.contains("<td>Requirements/SRS_Test</td><td>5</td><td>5</td><td>100%</td>"), "coverage: SRS_Test 5/5 = 100%");
            }
        }
    }
}

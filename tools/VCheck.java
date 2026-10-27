import java.io.*;
import org.apache.velocity.app.Velocity;
import org.apache.velocity.runtime.RuntimeSingleton;
public class VCheck {
  public static void main(String[] a) throws Exception {
    Velocity.setProperty("runtime.log.logsystem.class", "org.apache.velocity.runtime.log.NullLogSystem");
    Velocity.init();
    int bad = 0;
    for (String f : a) {
      try (Reader r = new InputStreamReader(new FileInputStream(f), "UTF-8")) {
        RuntimeSingleton.parse(r, f);
        System.out.println("OK    " + f);
      } catch (Throwable t) { bad++; System.out.println("ERROR " + f + ": " + t.toString().replace('\n',' ')); }
    }
    System.exit(bad == 0 ? 0 : 1);
  }
}

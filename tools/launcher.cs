using System;
using System.Diagnostics;
using System.IO;
using System.Threading;

class BlogAdminLauncher
{
    static Process child;

    static void Main()
    {
        Console.OutputEncoding = System.Text.Encoding.UTF8;
        string dir = AppDomain.CurrentDomain.BaseDirectory;
        string script = Path.Combine(dir, "tools", "blog-admin", "server.js");

        if (!File.Exists(script))
        {
            Console.WriteLine("找不到 " + script);
            Console.WriteLine("请把本程序放在博客仓库根目录。");
            Console.ReadKey();
            return;
        }

        var psi = new ProcessStartInfo("node", "\"" + script + "\"");
        psi.WorkingDirectory = dir;
        psi.UseShellExecute = false;

        try
        {
            child = Process.Start(psi);
        }
        catch (Exception e)
        {
            Console.WriteLine("启动 Node 失败，请确认已安装 Node.js 并加入 PATH。");
            Console.WriteLine(e.Message);
            Console.ReadKey();
            return;
        }

        Console.Title = "博客管理后台 - 关闭此窗口即停止";
        AppDomain.CurrentDomain.ProcessExit += delegate { KillChild(); };
        Console.CancelKeyPress += delegate { KillChild(); };

        if (Environment.GetEnvironmentVariable("BLOG_ADMIN_NO_OPEN") != "1")
        {
            Thread.Sleep(1400);
            try { Process.Start("http://127.0.0.1:7788/"); }
            catch { }
        }

        child.WaitForExit();
        Environment.Exit(child.ExitCode);
    }

    static void KillChild()
    {
        try
        {
            if (child != null && !child.HasExited)
            {
                var k = new ProcessStartInfo("taskkill", "/PID " + child.Id + " /T /F");
                k.UseShellExecute = false;
                k.CreateNoWindow = true;
                Process.Start(k);
            }
        }
        catch { }
    }
}

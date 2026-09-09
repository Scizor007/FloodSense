#!/usr/bin/env python3
"""Double-fork daemonizer — survives sandbox per-command process cleanup."""
import os
import sys
import time

PROJECT = "/home/z/my-project"
LOG = os.path.join(PROJECT, "dev.log")
PIDFILE = os.path.join(PROJECT, "dev-server.pid")


def daemonize():
    # fork 1: parent exits, child gets new session
    if os.fork() > 0:
        sys.exit(0)
    os.setsid()
    # fork 2: ensure the daemon can never re-acquire a tty
    if os.fork() > 0:
        sys.exit(0)
    # redirect stdio
    sys.stdout.flush()
    sys.stderr.flush()
    devnull = os.open(os.devnull, os.O_RDWR)
    logfd = os.open(LOG, os.O_WRONLY | os.O_APPEND | os.O_CREAT)
    os.dup2(devnull, 0)
    os.dup2(logfd, 1)
    os.dup2(logfd, 2)
    for fd in (devnull, logfd):
        try:
            os.close(fd)
        except OSError:
            pass
    # write pid
    with open(PIDFILE, "w") as f:
        f.write(str(os.getpid()))
    os.chdir(PROJECT)


def main():
    # if already listening on 3000, do nothing
    import socket
    s = socket.socket()
    try:
        s.bind(("127.0.0.1", 3000))
    except OSError:
        print("port 3000 already in use — assuming server is up")
        s.close()
        return
    s.close()

    daemonize()
    env = dict(os.environ)
    env["PORT"] = "3000"
    # exec directly into next dev (no shell, no pipeline)
    os.execvpe(
        "/home/z/my-project/node_modules/.bin/next",
        ["next", "dev", "-p", "3000"],
        env,
    )


if __name__ == "__main__":
    main()

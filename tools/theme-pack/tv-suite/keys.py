# Runs on the TV (Python 2 or 3): presses remote buttons through LG's network input socket, the one LG's phone app
# uses. Each message is a 4-byte big-endian length, then "type:button\nname:<KEY>\n\n".
#   ssh root@$TV_HOST python - KEY [KEY ...] < keys.py
# Waits KEYS_GAP seconds (default 0.3) between keys and after the last, so the socket is not closed under a press.
import os
import socket
import struct
import sys
import time

SOCK = "/tmp/netinput.pointer.sock"
gap = float(os.environ.get("KEYS_GAP", "0.3"))
s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
try:
    s.connect(SOCK)
except socket.error as e:
    # The service makes the socket only on demand: luna://com.webos.service.networkinput/getPointerInputSocket.
    sys.stderr.write("no key socket at %s (%s): ask getPointerInputSocket first\n" % (SOCK, e))
    sys.exit(1)
for name in sys.argv[1:]:
    m = ("type:button\nname:%s\n\n" % name).encode("ascii")
    s.sendall(struct.pack(">I", len(m)) + m)
    time.sleep(gap)
s.close()
print("sent " + " ".join(sys.argv[1:]))

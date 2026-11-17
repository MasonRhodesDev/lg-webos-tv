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
    sys.stderr.write("no key socket at %s (%s): ask getPointerInputSocket first\n" % (SOCK, e))
    sys.exit(1)
for name in sys.argv[1:]:
    m = ("type:button\nname:%s\n\n" % name).encode("ascii")
    s.sendall(struct.pack(">I", len(m)) + m)
    time.sleep(gap)
s.close()
print("sent " + " ".join(sys.argv[1:]))

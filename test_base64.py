import base64

raw = 'Z2l2aW5nLW1hY2F3LTgwLmNsZXJrLmFjY291bnRzLmRldiQ='
print("raw:", raw)

try:
    decoded = base64.b64decode(raw).decode('utf-8')
    print("decoded:", decoded)
except Exception as e:
    print("error:", e)

raw2 = 'Z2l2aW5nLW1hY2F3LTgwLmNsZXJrLmFjY291bnRzLmRldiQ'
try:
    padded = raw2.rstrip("$") + "=" * (-len(raw2.rstrip("$")) % 4)
    res = base64.b64decode(padded).decode("utf-8")
    print("padded result:", res)
except Exception as e:
    print("error:", e)

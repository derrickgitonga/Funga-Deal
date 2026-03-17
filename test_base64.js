const raw = 'Z2l2aW5nLW1hY2F3LTgwLmNsZXJrLmFjY291bnRzLmRldiQ='
console.log("raw:", raw)

try {
    const decoded = Buffer.from(raw, 'base64').toString('utf-8')
    console.log("decoded:", decoded)
} catch (e) {
    console.log("error:", e)
}

const raw2 = 'Z2l2aW5nLW1hY2F3LTgwLmNsZXJrLmFjY291bnRzLmRldiQ'
try {
    const padded = raw2.replace(/\$$/, '') + "=".repeat((-raw2.replace(/\$$/, '').length) % 4) // Python logic
    const res = Buffer.from(padded, 'base64').toString('utf-8')
    console.log("padded result:", res)
} catch (e) {
    console.log("error:", e)
}

// Mark Mirza's ₹90k EMI July 15 payment
const res = await fetch("http://localhost:" + process.env.PORT + "/api/auth/login", {
  method: "POST",
  headers: {"Content-Type": "application/json"},
  body: JSON.stringify({ phone: process.env.ADMIN_PHONE || "8917656405", password: process.env.ADMIN_PASSWORD })
});
const cookies = res.headers.get("set-cookie");
console.log("login:", res.status, cookies ? "got cookie" : "no cookie");

const payRes = await fetch("http://localhost:" + process.env.PORT + "/api/emi-loans/3163a4df-e6ad-4e2d-9977-da68caad247c/pay", {
  method: "POST",
  headers: {"Content-Type": "application/json", "Cookie": cookies ?? ""},
  body: JSON.stringify({ paidDate: "2026-07-15", paidAmount: 5000 })
});
const data = await payRes.json();
console.log("pay result:", payRes.status, JSON.stringify(data).slice(0, 500));

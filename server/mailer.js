const nodemailer = require("nodemailer");
const config = require("./config");

let transport = null;
if (config.SMTP.host) {
  transport = nodemailer.createTransport({
    host: config.SMTP.host,
    port: config.SMTP.port,
    secure: config.SMTP.secure,
    auth: config.SMTP.user ? { user: config.SMTP.user, pass: config.SMTP.pass } : undefined,
  });
}

// Sends a verification code. With no SMTP configured (local development) the code is printed
// in the terminal instead, so you can still try the flow without an email account.
async function sendCode(email, code, purpose) {
  const what = purpose === "reset" ? "reset your Taped password" : "finish creating your Taped account";
  if (!transport) {
    console.log("\n  [dev email] To: " + email + "\n  Your Taped code is " + code + " (" + what + ")\n");
    return { dev: true };
  }
  await transport.sendMail({
    from: config.SMTP.from,
    to: email,
    subject: "Your Taped code: " + code,
    text: "Use this code to " + what + ":\n\n    " + code + "\n\nIt expires in 10 minutes. If you didn't ask for it, ignore this email.",
    html: "<p>Use this code to " + what + ":</p><p style=\"font-size:28px;letter-spacing:6px;font-weight:700\">" + code + "</p><p>It expires in 10 minutes. If you didn't ask for it, ignore this email.</p>",
  });
  return { dev: false };
}

module.exports = { sendCode, usingSmtp: !!transport };

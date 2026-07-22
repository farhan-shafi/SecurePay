#!/usr/bin/env python3
"""Generate SecurePay_Project_Manual.pdf.

Run from anywhere:  python docs/build_manual.py
Needs: reportlab  (pip install reportlab).  Reads ait_logo.jpeg from the repo root
and writes SecurePay_Project_Manual.pdf there.
"""
import os

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.lib.colors import HexColor, white
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_JUSTIFY, TA_LEFT
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle, HRFlowable,
    KeepTogether,
)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "SecurePay_Project_Manual.pdf")
LOGO = os.path.join(ROOT, "ait_logo.jpeg")

INDIGO = HexColor("#5A4FF3")
INDIGO_DK = HexColor("#3F32D6")
NAVY = HexColor("#16162E")
GRAY = HexColor("#6B6E86")
LIGHT = HexColor("#F0F1F8")
LINE = HexColor("#E8E9F3")
PAGE_W, PAGE_H = A4

# ---------- styles ----------
body = ParagraphStyle("body", fontName="Helvetica", fontSize=10.5, leading=15.5,
                      textColor=NAVY, alignment=TA_JUSTIFY, spaceAfter=7)
h1 = ParagraphStyle("h1", fontName="Helvetica-Bold", fontSize=15, textColor=INDIGO_DK,
                    spaceBefore=8, spaceAfter=2)
h2 = ParagraphStyle("h2", fontName="Helvetica-Bold", fontSize=11.5, textColor=NAVY,
                    spaceBefore=8, spaceAfter=3)
bullet = ParagraphStyle("bullet", parent=body, leftIndent=16, bulletIndent=4,
                        spaceAfter=4, alignment=TA_LEFT)
small = ParagraphStyle("small", fontName="Helvetica", fontSize=9, textColor=GRAY, leading=12)
tocs = ParagraphStyle("toc", fontName="Helvetica", fontSize=11, textColor=NAVY, leading=20)
cell_st = ParagraphStyle("cell", fontName="Helvetica", fontSize=9.3, leading=12.5, textColor=NAVY)
hcell_st = ParagraphStyle("hcell", fontName="Helvetica-Bold", fontSize=9.3, leading=12.5, textColor=white)


def B(text):
    return Paragraph(text, bullet, bulletText="•")


def section(num, title):
    return [Paragraph(f"{num}.&nbsp;&nbsp;{title}", h1),
            HRFlowable(width="100%", thickness=1.4, color=INDIGO, spaceBefore=6, spaceAfter=7)]


def make_table(data, widths, header=True):
    rows = []
    for r, row in enumerate(data):
        st = hcell_st if (header and r == 0) else cell_st
        rows.append([Paragraph(str(v), st) for v in row])
    t = Table(rows, colWidths=widths, hAlign="LEFT")
    style = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 9),
        ("RIGHTPADDING", (0, 0), (-1, -1), 9),
        ("LINEBELOW", (0, 0), (-1, -1), 0.5, LINE),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [white, HexColor("#FAFAFE")]),
    ]
    if header:
        style += [("BACKGROUND", (0, 0), (-1, 0), INDIGO),
                  ("VALIGN", (0, 0), (-1, 0), "MIDDLE")]
    t.setStyle(TableStyle(style))
    return KeepTogether(t)


# ---------- cover + page decoration ----------
def cover(c, doc):
    c.saveState()
    cx = PAGE_W / 2
    c.setFillColor(INDIGO)
    c.rect(0, PAGE_H - 8, PAGE_W, 8, fill=1, stroke=0)
    lw = 150
    lh = lw * 679.0 / 756.0
    c.drawImage(LOGO, cx - lw / 2, PAGE_H - 55 - lh, lw, lh,
                preserveAspectRatio=True, mask="auto")
    c.setFillColor(NAVY)
    c.setFont("Helvetica-Bold", 14)
    c.drawCentredString(cx, PAGE_H - 210, "DEPARTMENT OF SOFTWARE TECHNOLOGY")
    c.setFillColor(GRAY)
    c.setFont("Helvetica-Oblique", 10.5)
    c.drawCentredString(cx, PAGE_H - 228, "Software Engineering Project")
    c.setStrokeColor(INDIGO)
    c.setLineWidth(2)
    c.line(cx - 95, PAGE_H - 244, cx + 95, PAGE_H - 244)
    c.setFillColor(INDIGO)
    c.setFont("Helvetica-Bold", 56)
    c.drawCentredString(cx, PAGE_H - 340, "SecurePay")
    c.setFillColor(NAVY)
    c.setFont("Helvetica-Bold", 17)
    c.drawCentredString(cx, PAGE_H - 370, "P R O J E C T   M A N U A L")
    c.setFillColor(GRAY)
    c.setFont("Helvetica-Oblique", 11.5)
    c.drawCentredString(cx, PAGE_H - 394,
                        "A secure digital payment and transaction management system")
    c.setStrokeColor(LINE)
    c.setLineWidth(1)
    c.line(cx - 130, PAGE_H - 410, cx + 130, PAGE_H - 410)
    bx, by, bw, bh = 95, 232, PAGE_W - 190, 172
    c.setFillColor(LIGHT)
    c.roundRect(bx, by, bw, bh, 12, fill=1, stroke=0)
    c.setFillColor(INDIGO_DK)
    c.setFont("Helvetica-Bold", 12.5)
    c.drawString(bx + 28, by + bh - 32, "Team ID:  SET-3A-17")
    c.setFillColor(GRAY)
    c.setFont("Helvetica-Bold", 9.5)
    c.drawString(bx + 28, by + bh - 60, "TEAM MEMBERS")
    c.setFillColor(NAVY)
    c.setFont("Helvetica", 11)
    c.drawString(bx + 28, by + bh - 82, "Farhan Shafi")
    c.drawRightString(bx + bw - 28, by + bh - 82, "GR: 2024-DSET/M-004")
    c.drawString(bx + 28, by + bh - 102, "Sarim Mahmood")
    c.drawRightString(bx + bw - 28, by + bh - 102, "GR: 2024-DSET/M-002")
    c.setStrokeColor(LINE)
    c.setLineWidth(1)
    c.line(bx + 28, by + 44, bx + bw - 28, by + 44)
    c.setFillColor(GRAY)
    c.setFont("Helvetica-Bold", 9.5)
    c.drawString(bx + 28, by + 24, "GUIDED BY")
    c.setFillColor(INDIGO_DK)
    c.setFont("Helvetica-Bold", 11)
    c.drawRightString(bx + bw - 28, by + 24, "Sir Nehal Naveed")
    c.setFillColor(NAVY)
    c.rect(0, 0, PAGE_W, 52, fill=1, stroke=0)
    c.setFillColor(white)
    c.setFont("Helvetica-Oblique", 11)
    c.drawCentredString(cx, 21, "“Security isn’t a feature — it’s the foundation.”")
    c.restoreState()


def later(c, doc):
    c.saveState()
    c.setStrokeColor(INDIGO)
    c.setLineWidth(1.4)
    c.line(2 * cm, PAGE_H - 52, PAGE_W - 2 * cm, PAGE_H - 52)
    c.setFillColor(GRAY)
    c.setFont("Helvetica", 8)
    c.drawString(2 * cm, PAGE_H - 47, "SecurePay  ·  Project Manual")
    c.drawRightString(PAGE_W - 2 * cm, PAGE_H - 47, "Page %d" % (doc.page - 1))
    c.setStrokeColor(LINE)
    c.setLineWidth(0.8)
    c.line(2 * cm, 40, PAGE_W - 2 * cm, 40)
    c.drawString(2 * cm, 30, "Aligarh Institute of Technology")
    c.drawRightString(PAGE_W - 2 * cm, 30, "Department of Software Technology")
    c.restoreState()


# ---------- content ----------
S = []

S += [PageBreak(), Paragraph("Contents", h1),
      HRFlowable(width="100%", thickness=1.4, color=INDIGO, spaceBefore=6, spaceAfter=12)]
toc = [
    "1.  Introduction", "2.  Objectives", "3.  Technology Stack", "4.  System Architecture",
    "5.  Database Design", "6.  Key Features", "7.  How It Works", "8.  Fraud Detection",
    "9.  Security & Reliability", "10.  Installation & Running", "11.  Conclusion & Future Scope",
]
for item in toc:
    S.append(Paragraph(item, tocs))

# 1. Introduction
S += [PageBreak()] + section(1, "Introduction")
S.append(Paragraph(
    "SecurePay is a secure, microservices-based digital wallet. Users register and verify their "
    "email, then open one or more wallets — one per currency — fund them, save "
    "beneficiaries, and send money to anyone, including across currencies at the live exchange "
    "rate. They can also receive money by sharing a QR code, pay bills, and review a full "
    "statement they can export as a PDF.", body))
S.append(Paragraph(
    "Safety is built into every step: transfers are debited and credited inside a single locked "
    "database transaction, screened for fraud in real time before any money moves, and confirmed "
    "with the phone's fingerprint or face. The backend is a set of Python (FastAPI) microservices "
    "running in Docker, backed by PostgreSQL, Redis and RabbitMQ; the client is a React Native "
    "(Expo) app that runs on both Android and iOS.", body))

# 2. Objectives
S += section(2, "Objectives")
for t in [
    "To automate digital payments with a secure, easy-to-use multi-currency wallet.",
    "To guarantee correct money handling using ACID transactions and row locking, so a balance "
    "can never be corrupted or a payment duplicated.",
    "To detect and block fraudulent transfers in real time, before any money moves.",
    "To support multiple currencies with automatic conversion at live exchange rates.",
    "To secure accounts and every payment with email verification and device biometrics.",
    "To reliably notify users of activity, and to demonstrate a scalable microservices design.",
]:
    S.append(B(t))

# 3. Technology Stack
S += section(3, "Technology Stack")
S.append(Paragraph("The project uses a modern, industry-standard stack. Each tool was chosen for "
                   "a specific reason:", body))
S.append(make_table([
    ["Layer", "Technology", "Why it was used"],
    ["Mobile app", "React Native, Expo, TypeScript", "One codebase for Android + iOS; camera (QR) and biometrics built in"],
    ["Backend", "Python, FastAPI", "Fast to build, auto-generated API docs, high performance"],
    ["Database", "PostgreSQL", "ACID transactions + row locking keep money correct"],
    ["Cache / OTP", "Redis", "Fast in-memory store for rate limits and expiring codes"],
    ["Message broker", "RabbitMQ", "Async events so notifications never slow down a payment"],
    ["Security", "JWT (access + refresh), bcrypt", "Stateless auth with silent refresh; safely hashed passwords"],
    ["Email", "Resend", "Delivers verification codes and transaction alerts"],
    ["DevOps", "Docker, Compose, GitHub Actions", "One-command run; CI checks every push"],
    ["Tools", "VS Code, Git & GitHub", "Development environment and version control"],
], [2.6 * cm, 4.6 * cm, 8.8 * cm]))

# 4. System Architecture
S += [PageBreak()] + section(4, "System Architecture")
S.append(Paragraph(
    "SecurePay follows a microservices architecture: instead of one large program, the system is "
    "split into small services that each own one job. All requests enter through a single API "
    "Gateway, which rate-limits traffic and forwards each request to the correct service. The "
    "services share one PostgreSQL database, use Redis for temporary data, and communicate "
    "asynchronously through RabbitMQ.", body))
S.append(Paragraph("Request path:", h2))
S.append(Paragraph("Mobile App&nbsp;&nbsp;&#8594;&nbsp;&nbsp;API Gateway&nbsp;&nbsp;&#8594;&nbsp;"
                   "&nbsp;Microservices&nbsp;&nbsp;&#8594;&nbsp;&nbsp;PostgreSQL", small))
S.append(Spacer(1, 6))
S.append(make_table([
    ["Component", "Responsibility"],
    ["API Gateway", "Single public entry point; per-IP rate limiting (Redis); routing"],
    ["User Service", "Register, login (JWT + refresh), verify email, forgot password, notifications"],
    ["Wallet Service", "Create wallets (one per currency), balance, deposit, statement, beneficiaries"],
    ["Transaction Service", "P2P transfers and bill payments, live FX, publishes events via an outbox"],
    ["Fraud Service", "Real-time rule-based screening of every transfer (internal)"],
    ["Notification Service", "Background worker; consumes events and sends email alerts"],
], [4.2 * cm, 11.8 * cm]))

# 5. Database Design
S += section(5, "Database Design")
S.append(Paragraph("The schema is versioned with Alembic migrations. The main entities and their "
                   "key fields are:", body))
S.append(make_table([
    ["Entity", "Key fields", "Purpose"],
    ["users", "user_id (PK), email, phone, password_hash, kyc_verified", "Account details"],
    ["wallets", "wallet_id (PK), user_id (FK), currency, balance", "A user's money (one row per currency)"],
    ["transactions", "transaction_id (PK), sender/recipient (FK), amount, fx_rate, idempotency_key", "Every transfer / bill"],
    ["beneficiaries", "id (PK), owner_user_id (FK), wallet_id (FK), nickname", "Saved payees"],
    ["fraud_logs", "id (PK), wallet_id (FK), fraud_score, risk_level, action_taken", "Flagged / blocked transfers"],
    ["notifications", "id (PK), user_id (FK), channel, message, status", "Sent alerts (audit trail)"],
    ["billers", "id (PK), name, category, wallet_id (FK)", "Bill payees (system wallets)"],
    ["outbox_events", "id (PK), routing_key, payload, status", "Reliable event delivery (outbox)"],
], [2.9 * cm, 8.6 * cm, 4.5 * cm]))
S.append(Spacer(1, 4))
S.append(Paragraph("Relationships: a user has many wallets (one per currency); a wallet has many "
                   "transactions; a user has many beneficiaries, fraud logs and notifications; each "
                   "biller is backed by a system wallet.", small))

# 6. Key Features
S += [PageBreak()] + section(6, "Key Features")
for name, desc in [
    ("Multi-currency wallets", "hold USD, EUR, GBP and PKR at once — one wallet per currency, switched from the home screen."),
    ("Email verification (OTP)", "a 6-digit code is emailed at sign-up; a wallet can only be opened after the email is verified."),
    ("Send &amp; receive by QR", "share your wallet as a QR code, or scan someone else's to pay them without typing an id."),
    ("Live currency conversion", "cross-currency transfers are converted at the live rate, previewed before you send."),
    ("Real-time fraud detection", "a rule-based engine scores every transfer and blocks suspicious ones."),
    ("Bill payments", "pay electricity, internet, gas and mobile billers by reference number."),
    ("Biometric confirmation", "every payment is confirmed with the device fingerprint or face."),
    ("Beneficiaries", "save payees once and send to them by name."),
    ("Statements, PDF &amp; insights", "filter transactions by date, export a PDF, and view a monthly money-in/out chart."),
    ("Notifications &amp; security center", "an in-app feed of alerts, plus a screen showing your own fraud-screening events."),
    ("Forgot password", "reset a lost password with a code emailed to the account address."),
]:
    S.append(Paragraph(f"<b>{name}</b> &mdash; {desc}", bullet, bulletText="•"))

# 7. How It Works
S += section(7, "How It Works")
S.append(Paragraph("A typical user journey flows through the system as follows:", body))
for t in [
    "<b>Register &amp; verify:</b> the user signs up; the user-service emails a 6-digit code "
    "(stored in Redis for 5 minutes) which the user enters to verify their email.",
    "<b>Create wallet &amp; deposit:</b> once verified, the user opens a wallet in a chosen "
    "currency (and more later, one per currency) and adds money.",
    "<b>Pay:</b> the user sends money to a payee (typed, saved, or QR-scanned) or pays a bill. "
    "After a biometric check, the transaction-service screens it for fraud, converts the amount "
    "if needed, then debits the sender and credits the recipient in one atomic, locked commit.",
    "<b>Notify &amp; record:</b> the transfer writes an event to an outbox in the same commit; a "
    "drainer publishes it to RabbitMQ, the notification-service emails both parties, and the "
    "statement records it.",
]:
    S.append(B(t))

# 8. Fraud Detection
S += [PageBreak()] + section(8, "Fraud Detection")
S.append(Paragraph("Every transfer is screened before any money moves. The fraud-service is "
                   "rule-based: each rule that fires adds points to a risk score.", body))
S.append(make_table([
    ["Rule", "Fires when", "Points"],
    ["High velocity", "More than 5 transfers from a wallet in the last 5 minutes", "+30"],
    ["Unusual amount", "The transfer is more than 2x the wallet's average transfer", "+25"],
    ["New large recipient", "First-ever payment to this recipient and it is >= $500", "+20"],
    ["Statistical anomaly", "The amount is 3+ standard deviations above the wallet's own history", "+15"],
], [3.8 * cm, 10.0 * cm, 1.7 * cm]))
S.append(Spacer(1, 6))
S.append(Paragraph("The total score maps to a risk level and an action:", body))
S.append(make_table([
    ["Score", "Risk level", "Action"],
    ["0 - 29", "Low", "Approve"],
    ["30 - 59", "Medium", "Review (allowed, but logged)"],
    ["60 - 84", "High", "Block (HTTP 403)"],
    ["85 - 100", "Critical", "Block (HTTP 403)"],
], [3.0 * cm, 3.4 * cm, 9.6 * cm]))
S.append(Spacer(1, 6))
S.append(Paragraph("<b>Example:</b> a user makes 6 rapid transfers, then sends $600 to a brand-new "
                   "recipient. Three rules fire: 30 + 25 + 20 = 75 (High) — the transfer is "
                   "blocked. The statistical-anomaly rule is an ML-lite stepping stone: it adapts to "
                   "each user by scoring against their own spending pattern (a z-score), the first "
                   "feature a real machine-learning fraud model would use.", body))

# 9. Security & Reliability
S += section(9, "Security & Reliability")
for t in [
    "<b>Password hashing (bcrypt):</b> passwords are never stored in plain text — only a slow, salted hash.",
    "<b>Stateless auth (JWT + refresh):</b> a short-lived access token proves identity; the app "
    "silently exchanges a refresh token for a new one, so sessions last without long-lived tokens.",
    "<b>Email verification &amp; biometrics:</b> the user proves they own their email, and confirms "
    "every payment with the device fingerprint or face.",
    "<b>Row locking &amp; ACID:</b> transfers lock both wallets (in a fixed order) so concurrent "
    "transfers can't corrupt a balance.",
    "<b>Idempotency keys:</b> the same transfer sent twice is executed only once.",
    "<b>Rate limiting:</b> the gateway caps requests per IP to resist abuse.",
    "<b>Transactional outbox:</b> each event is written in the same database transaction as the "
    "transfer, then published to RabbitMQ by a drainer — so a completed transfer can never "
    "silently lose its notification (at-least-once delivery).",
]:
    S.append(B(t))

# 10. Installation & Running
S += [PageBreak()] + section(10, "Installation & Running")
S.append(Paragraph("<b>Prerequisites:</b> Docker Desktop (includes Docker &amp; Docker Compose), and "
                   "Node.js with the Expo Go app on a phone for the mobile client.", body))
S.append(Paragraph("Run the backend", h2))
S.append(Paragraph(
    "1.&nbsp; cd securepay<br/>"
    "2.&nbsp; cp .env.example .env<br/>"
    "3.&nbsp; docker compose up --build<br/>"
    "4.&nbsp; python3 scripts/smoke_test.py&nbsp;&nbsp;(end-to-end check)", small))
S.append(Spacer(1, 6))
S.append(Paragraph("Run the mobile app", h2))
S.append(Paragraph(
    "1.&nbsp; cd securepay/mobile<br/>"
    "2.&nbsp; npm install<br/>"
    "3.&nbsp; npx expo start&nbsp;&nbsp;(scan the QR code with Expo Go on the same Wi-Fi)", small))
S.append(Spacer(1, 8))
S.append(Paragraph("To stop: docker compose stop (data is preserved). To start again: docker "
                   "compose start. Never use docker compose down -v — it deletes all data.", body))

# 11. Conclusion
S += section(11, "Conclusion & Future Scope")
S.append(Paragraph(
    "SecurePay delivers a secure, scalable and user-friendly digital wallet. Its microservices "
    "design, real-time fraud screening, multi-currency support, bill payments and biometric-"
    "protected transfers bring a production-grade fintech experience to a single platform. The "
    "project demonstrates practical use of Docker, PostgreSQL, Redis, RabbitMQ, JWT security, a "
    "transactional outbox, and cross-platform mobile development.", body))
S.append(Paragraph("<b>Future scope:</b> a machine-learning fraud model on top of the current "
                   "signals, push notifications, merchant / shop QR payments, a web version, and "
                   "debit-card integration.", body))

# ---------- build ----------
doc = SimpleDocTemplate(OUT, pagesize=A4, leftMargin=2 * cm, rightMargin=2 * cm,
                        topMargin=2.2 * cm, bottomMargin=1.8 * cm,
                        title="SecurePay Project Manual", author="Farhan Shafi, Sarim Mahmood")
doc.build(S, onFirstPage=cover, onLaterPages=later)
print("WROTE", OUT)

const express = require('express');
const router = express.Router();
const { isAdmin } = require('../../../server/middleware/auth');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// Generate receipt number
function generateReceiptNumber() {
  const prefix = 'UC';
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}${randomNum}`;
}

// Format date to "11th of January 2026"
function formatDate(date) {
  const d = new Date(date);
  const day = d.getDate();
  const month = d.toLocaleString('en-US', { month: 'long' });
  const year = d.getFullYear();
  
  // Add ordinal suffix (st, nd, rd, th)
  const j = day % 10;
  const k = day % 100;
  let suffix = 'th';
  if (j === 1 && k !== 11) suffix = 'st';
  if (j === 2 && k !== 12) suffix = 'nd';
  if (j === 3 && k !== 13) suffix = 'rd';
  
  return `${day}${suffix} of ${month} ${year}`;
}

function renderReceiptPdf(doc, {
  receiptNumber,
  receiptDate,
  studentName,
  studentId,
  enrolledProgram,
  paymentPlan,
  payments
}) {
  // UCAGS Purple color
  const purple = '#5B2C6F';
  const lightPurple = '#E8DFF5';

  // Resolve assets from project root
  // __dirname = <root>/backend/modules/receipts
  const rootDir = path.join(__dirname, '../../..');
  const logoPngPath = path.join(rootDir, 'logo.png');
  const sealPngPath = path.join(rootDir, 'seal.png');

  // Fonts (San Francisco).
  // Note: Apple's San Francisco fonts are not bundled here due to licensing.
  // If you add SF Pro font files to <root>/fonts/, they will be used automatically.
  const fontsDir = path.join(rootDir, 'fonts');
  const sfRegular = path.join(fontsDir, 'SF-Pro-Text-Regular.ttf');
  const sfBold = path.join(fontsDir, 'SF-Pro-Text-Semibold.ttf');
  const sfBold2 = path.join(fontsDir, 'SF-Pro-Text-Bold.ttf');

  const hasSf = fs.existsSync(sfRegular) && (fs.existsSync(sfBold) || fs.existsSync(sfBold2));
  const fontRegular = hasSf ? 'SF' : 'Helvetica';
  const fontBold = hasSf ? 'SF-Bold' : 'Helvetica-Bold';

  if (hasSf) {
    try {
      doc.registerFont('SF', sfRegular);
      doc.registerFont('SF-Bold', fs.existsSync(sfBold) ? sfBold : sfBold2);
    } catch (e) {
      // Fallback silently
    }
  }

  // Header - Purple background
  doc.rect(0, 0, doc.page.width, 70).fill(purple);

  doc.fontSize(32)
    .fillColor('white')
    .font(fontBold)
    .text('RECEIPT', 30, 18);

  if (fs.existsSync(logoPngPath)) {
    try {
      // Bigger logo aligned with the RECEIPT title line
      doc.image(logoPngPath, doc.page.width - 178, 2, { fit: [155, 70] });
    } catch (err) {
      // ignore
    }
  }

  // Info box with rounded top-right corner
  const boxY = 70;
  const cornerRadius = 15;

  // More breathing room for the receipt details block
  const boxHeight = 148;

  doc.fillColor(purple);
  doc.moveTo(doc.page.width - cornerRadius, boxY)
    .lineTo(doc.page.width, boxY)
    .lineTo(doc.page.width, boxY + cornerRadius)
    .closePath()
    .fill();

  doc.fillColor(lightPurple);
  doc.moveTo(0, boxY)
    .lineTo(doc.page.width - cornerRadius, boxY)
    .quadraticCurveTo(doc.page.width, boxY, doc.page.width, boxY + cornerRadius)
    .lineTo(doc.page.width, boxY + boxHeight)
    .lineTo(0, boxY + boxHeight)
    .closePath()
    .fill();

  // Receipt details (with spacing + white dividers)
  const detailsLeftX = 30;
  const detailsRightX = doc.page.width - 30;
  const detailLineGap = 22; // vertical spacing between items
  const dividerInset = 0;

  const details = [
    `Receipt No: ${receiptNumber}`,
    `Receipt Date: ${formatDate(receiptDate)}`,
    `Student: ${studentName}`,
    `Student ID: ${studentId}`,
    `Enrolled program: ${enrolledProgram}`,
    `Payment plan: ${paymentPlan}`
  ];

  let yPos = boxY + 16;
  doc.fontSize(11).fillColor('#101828').font(fontRegular);

  details.forEach((line, idx) => {
    doc.text(line, detailsLeftX, yPos, {
      width: detailsRightX - detailsLeftX,
      lineGap: 2
    });

    // Divider between rows (white line)
    if (idx < details.length - 1) {
      const dividerY = yPos + detailLineGap - 7;
      doc
        .save()
        .lineWidth(1)
        .strokeColor('#FFFFFF')
        .moveTo(detailsLeftX + dividerInset, dividerY)
        .lineTo(detailsRightX - dividerInset, dividerY)
        .stroke()
        .restore();
    }

    yPos += detailLineGap;
  });

  // Footer (fixed)
  const footerY = doc.page.height - 90;

  // Thank you + seal (keep above footer)
  const sealSize = 105;
  const thankYouHeight = 16;
  const thankYouToSealGap = 18;
  const sealTopPad = 8;
  const sealBottomPad = 8;

  const sealBlockHeight = (fs.existsSync(sealPngPath) ? (sealTopPad + sealSize + sealBottomPad) : 0);
  const thankBlockHeight = thankYouHeight + thankYouToSealGap + sealBlockHeight;

  // Payment table (moved down to prevent overlap with details)
  yPos = boxY + boxHeight + 18;
  const tableTop = yPos;
  const col1X = 30;
  const col2X = 60;
  const col3X = 140;
  const col4X = 240;
  const col5X = 310;

  doc.rect(col1X, tableTop, doc.page.width - 60, 30).fill(purple);
  doc.fontSize(9).fillColor('white').font(fontBold);
  doc.text('No', col1X + 5, tableTop + 10, { width: 25 });
  doc.text('Date', col2X + 5, tableTop + 10, { width: 70 });
  doc.text('Description', col3X + 5, tableTop + 10, { width: 90 });
  doc.text('Paid by', col4X + 5, tableTop + 10, { width: 60 });
  doc.text('Amount', col5X + 5, tableTop + 10, { width: 80 });

  yPos += 30;

  // Fit rows into the space available above the footer + thank-you block
  const availableBottomY = footerY - thankBlockHeight - 16;
  const rowHeight = 25;
  const rows = (payments || []);
  const totalAmountAll = rows.reduce((sum, p) => sum + (parseFloat(p?.amount) || 0), 0);

  // Reserve space for total row
  const maxRows = Math.max(0, Math.floor((availableBottomY - yPos - rowHeight) / rowHeight));
  const visibleRows = rows.slice(0, maxRows);

  visibleRows.forEach((payment, index) => {
    doc.rect(col1X, yPos, doc.page.width - 60, rowHeight).fill(index % 2 === 0 ? '#F5F3FF' : lightPurple);
    doc.fontSize(9).fillColor('#101828').font(fontRegular);

    doc.text(String(index + 1), col1X + 5, yPos + 8, { width: 25 });
    doc.text(payment.date || '-', col2X + 5, yPos + 8, { width: 70 });
    doc.text(payment.description || '-', col3X + 5, yPos + 8, { width: 90 });
    doc.text(payment.paidBy || '-', col4X + 5, yPos + 8, { width: 60 });

    const amount = parseFloat(payment.amount) || 0;
    doc.text(amount > 0 ? `LKR ${amount.toLocaleString()}` : '-', col5X + 5, yPos + 8, { width: 80 });

    yPos += rowHeight;
  });

  const omitted = rows.length - visibleRows.length;
  if (omitted > 0) {
    doc.fontSize(8).fillColor('#667085').font(fontRegular)
      .text(`+${omitted} more payment(s) not shown`, col1X + 5, yPos + 6, { width: doc.page.width - 60 });
    yPos += 14;
  }

  // Total row (ensure it stays visible)
  const totalRectY = Math.min(yPos, availableBottomY);
  doc.rect(col4X, totalRectY, doc.page.width - col4X - 30, rowHeight).fill(lightPurple);
  doc.fontSize(10).fillColor('#101828').font(fontBold);
  doc.text(`LKR ${totalAmountAll.toLocaleString()}`, col5X + 5, totalRectY + 8, { width: 80 });

  yPos = totalRectY + rowHeight;

  // Place thank-you block either 30pt after table or (if needed) squeeze it to be above footer.
  yPos += 32;
  yPos = Math.min(yPos, footerY - thankBlockHeight - 10);

  doc.fontSize(11).fillColor('#101828').font(fontRegular)
    .text('Thank you for your payment', 30, yPos, { align: 'center', width: doc.page.width - 60 });

  yPos += thankYouToSealGap;
  if (fs.existsSync(sealPngPath)) {
    try {
      // Bigger seal, moved more to the right
      const sealX = (doc.page.width / 2) - (sealSize / 2) + 85;
      doc.image(sealPngPath, sealX, yPos + sealTopPad, { width: sealSize, height: sealSize });
      yPos += sealTopPad + sealSize + sealBottomPad;
    } catch (err) {
      // ignore
    }
  }

  // Footer
  const footerRadius = 15;
  const collegeTitleHeight = 32;

  doc.fillColor(purple);
  doc.moveTo(0, footerY + footerRadius)
    .quadraticCurveTo(0, footerY, footerRadius, footerY)
    .lineTo(doc.page.width - footerRadius, footerY)
    .quadraticCurveTo(doc.page.width, footerY, doc.page.width, footerY + footerRadius)
    .lineTo(doc.page.width, doc.page.height)
    .lineTo(0, doc.page.height)
    .closePath()
    .fill();

  doc.fillColor(lightPurple);
  doc.moveTo(0, footerY + footerRadius)
    .quadraticCurveTo(0, footerY, footerRadius, footerY)
    .lineTo(doc.page.width - footerRadius, footerY)
    .quadraticCurveTo(doc.page.width, footerY, doc.page.width, footerY + footerRadius)
    .lineTo(doc.page.width, footerY + collegeTitleHeight)
    .lineTo(0, footerY + collegeTitleHeight)
    .closePath()
    .fill();

  doc.fontSize(10).fillColor('black').font(fontBold)
    .text('UNIVERSAL COLLEGE OF APPLIED & GENERAL STUDIES', 20, footerY + 9, {
      align: 'center',
      width: doc.page.width - 40
    });

  const contactY = footerY + collegeTitleHeight;
  doc.fontSize(8).fillColor('white').font(fontRegular);
  const footerTextY = contactY + 12;
  doc.text('Corporate Office: 190 A Anagarika Dharmapala Mawatha (Allen Avenue), Dehiwala, Sri Lanka', 20, footerTextY, {
    align: 'center',
    width: doc.page.width - 40
  });
  doc.text('Hotline: +94 76 331 3333    Email: study@ucags.com    Website: https://ucags.edu.lk/', 20, footerTextY + 12, {
    align: 'center',
    width: doc.page.width - 40
  });
}

// Generate Receipt PDF
router.post('/generate', isAdmin, async (req, res) => {
  try {
    const {
      receiptNumber,
      receiptDate,
      studentName,
      studentId,
      enrolledProgram,
      paymentPlan,
      payments
    } = req.body;

    // Validate required fields
    if (!studentName || !studentId || !enrolledProgram || !paymentPlan || !payments || payments.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }

    // Generate receipt number if not provided
    const finalReceiptNumber = receiptNumber || generateReceiptNumber();
    const finalReceiptDate = receiptDate || new Date().toISOString().split('T')[0];

    // Create PDF with custom page size (595x842 is A4)
    const doc = new PDFDocument({
      size: [420, 595], // Width: 420pt, Height: 595pt (portrait)
      margins: { top: 0, bottom: 0, left: 0, right: 0 }
    });

    // Set response headers (with cache prevention)
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=receipt-${finalReceiptNumber}.pdf`);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    // Pipe PDF to response
    doc.pipe(res);

    renderReceiptPdf(doc, {
      receiptNumber: finalReceiptNumber,
      receiptDate: finalReceiptDate,
      studentName,
      studentId,
      enrolledProgram,
      paymentPlan,
      payments
    });

    // Finalize PDF
    doc.end();

  } catch (error) {
    console.error('Error generating receipt:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate receipt: ' + error.message
    });
  }
});

// Get next receipt number (preview)
// NOTE: This does not reserve the number in DB; it returns max(receipt_no)+1.
router.get('/next-number', isAdmin, async (req, res) => {
  try {
    const { getSupabaseAdmin } = require('../../core/supabase/supabaseAdmin');
    const sb = getSupabaseAdmin();

    // Prefer receipts table if available
    let maxNo = null;
    try {
      const { data, error } = await sb
        .from('receipts')
        .select('receipt_no')
        .ilike('receipt_no', 'UC%')
        .order('receipt_no', { ascending: false })
        .limit(1);
      if (!error) {
        const last = (data || [])[0]?.receipt_no || '';
        const m = String(last).match(/UC(\d+)/i);
        if (m) maxNo = parseInt(m[1], 10);
      }
    } catch (e) {
      // receipts table may not exist
    }

    // Fallback: payments table receipt_no
    if (maxNo === null) {
      const { data, error } = await sb
        .from('payments')
        .select('receipt_no')
        .not('receipt_no', 'is', null)
        .ilike('receipt_no', 'UC%')
        .order('receipt_no', { ascending: false })
        .limit(1);
      if (!error) {
        const last = (data || [])[0]?.receipt_no || '';
        const m = String(last).match(/UC(\d+)/i);
        if (m) maxNo = parseInt(m[1], 10);
      }
    }

    const next = (Number.isFinite(maxNo) ? maxNo + 1 : 1);
    const receiptNumber = `UC${String(next).padStart(4, '0')}`;

    res.json({ success: true, receiptNumber });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Debug endpoint to check what version is loaded
router.get('/version', isAdmin, (req, res) => {
  res.json({
    success: true,
    version: 'v3-with-seal-and-all-changes',
    timestamp: new Date().toISOString(),
    features: {
      headerHeight: 80,
      sealImage: true,
      roundedCorners: true,
      footerBox: true
    }
  });
});

// Download receipt PDF for a payment (auto template)
// GET /api/receipts/payment/:paymentId
router.get('/payment/:paymentId', isAdmin, async (req, res) => {
  try {
    const { getSupabaseAdmin } = require('../../core/supabase/supabaseAdmin');
    const sb = getSupabaseAdmin();
    const paymentId = String(req.params.paymentId || '').trim();
    if (!paymentId) return res.status(400).json({ success: false, error: 'Missing paymentId' });

    // Load payment
    const { data: payment, error: pErr } = await sb
      .from('payments')
      .select('*')
      .eq('id', paymentId)
      .single();
    if (pErr) throw pErr;

    const regId = payment.registration_id;
    let registration = null;
    if (regId) {
      const { data: reg, error: rErr } = await sb
        .from('registrations')
        .select('*')
        .eq('id', regId)
        .single();
      if (!rErr) registration = reg;
    }

    const payload = registration?.payload && typeof registration.payload === 'object' ? registration.payload : {};

    const receiptNumber = payment.receipt_no || '';
    if (!receiptNumber) {
      return res.status(400).json({ success: false, error: 'No receipt number on this payment yet.' });
    }

    // Reuse same template generation logic by calling internal generate pipeline
    const finalReceiptDate = (payment.confirmed_at || payment.payment_date || new Date().toISOString()).slice(0, 10);

    const studentName = registration?.name || payload.name || payment.registration_name || '';
    const studentIdRaw = (registration?.student_id || payload.student_id || '');
    const studentId = (() => {
      const v = String(studentIdRaw || '').trim();
      if (!v) return '';
      if (v.includes('/')) return v;
      const m = v.match(/^([A-Za-z]+)(\d+)$/);
      if (!m) return v;
      return `${m[1]}/${m[2]}`;
    })();
    const enrolledProgram = registration?.program_name || payload.program_name || payload.course_program || payment.program_name || '';
    const paymentPlan = payment.payment_plan || '';

    const ordinal = (n) => {
      const num = Number(n);
      if (!Number.isFinite(num)) return '';
      const j = num % 10;
      const k = num % 100;
      if (j === 1 && k !== 11) return `${num}st`;
      if (j === 2 && k !== 12) return `${num}nd`;
      if (j === 3 && k !== 13) return `${num}rd`;
      return `${num}th`;
    };

    const planLower = String(payment.payment_plan || '').toLowerCase();
    const isFull = planLower.includes('full payment');
    const isRegFee = planLower.includes('registration fee');

    let desc = 'Payment';
    if (isRegFee) {
      desc = 'Registration Fee';
    } else if (isFull) {
      desc = 'Full Payment';
    } else if (payment.installment_no) {
      desc = `${ordinal(payment.installment_no)} Installment`;
    }

    const paidBy = payment.payment_method || '-';

    const payments = [
      {
        date: payment.payment_date || finalReceiptDate,
        description: desc,
        paidBy,
        amount: Number(payment.amount || 0)
      }
    ];

    // Generate PDF using same full template as manual receipts
    const doc = new PDFDocument({
      size: [420, 595],
      margins: { top: 0, bottom: 0, left: 0, right: 0 }
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=receipt-${receiptNumber}.pdf`);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    doc.pipe(res);

    renderReceiptPdf(doc, {
      receiptNumber,
      receiptDate: finalReceiptDate,
      studentName,
      studentId,
      enrolledProgram,
      paymentPlan,
      payments
    });

    doc.end();
  } catch (e) {
    // If streaming already started, don't write JSON into the PDF stream (it corrupts the file)
    if (res.headersSent) {
      try { res.end(); } catch (_) {}
      return;
    }
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

module.exports = router;

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

  // Header - Purple background
  doc.rect(0, 0, doc.page.width, 70).fill(purple);

  doc.fontSize(32)
    .fillColor('white')
    .font('Helvetica-Bold')
    .text('RECEIPT', 30, 18);

  // Resolve assets from project root
  // __dirname = <root>/backend/modules/receipts
  const rootDir = path.join(__dirname, '../../..');
  const logoPngPath = path.join(rootDir, 'logo.png');
  const sealPngPath = path.join(rootDir, 'seal.png');

  if (fs.existsSync(logoPngPath)) {
    try {
      doc.image(logoPngPath, doc.page.width - 135, 10, { fit: [120, 55] });
    } catch (err) {
      // ignore
    }
  }

  // Info box with rounded top-right corner
  const boxY = 70;
  const boxHeight = 100;
  const cornerRadius = 15;

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

  // Receipt details
  let yPos = 80;
  doc.fontSize(11).fillColor('black').font('Helvetica');
  doc.text(`Receipt No: ${receiptNumber}`, 30, yPos); yPos += 15;
  doc.text(`Receipt Date: ${formatDate(receiptDate)}`, 30, yPos); yPos += 15;
  doc.text(`Student: ${studentName}`, 30, yPos); yPos += 15;
  doc.text(`Student ID: ${studentId}`, 30, yPos); yPos += 15;
  doc.text(`Enrolled program: ${enrolledProgram}`, 30, yPos); yPos += 15;
  doc.text(`Payment plan: ${paymentPlan}`, 30, yPos);

  // Payment table
  yPos = 190;
  const tableTop = yPos;
  const col1X = 30;
  const col2X = 60;
  const col3X = 140;
  const col4X = 240;
  const col5X = 310;

  doc.rect(col1X, tableTop, doc.page.width - 60, 30).fill(purple);
  doc.fontSize(9).fillColor('white').font('Helvetica-Bold');
  doc.text('No', col1X + 5, tableTop + 10, { width: 25 });
  doc.text('Date', col2X + 5, tableTop + 10, { width: 70 });
  doc.text('Description', col3X + 5, tableTop + 10, { width: 90 });
  doc.text('Paid by', col4X + 5, tableTop + 10, { width: 60 });
  doc.text('Amount', col5X + 5, tableTop + 10, { width: 80 });

  yPos += 30;
  let totalAmount = 0;

  (payments || []).forEach((payment, index) => {
    doc.rect(col1X, yPos, doc.page.width - 60, 25).fill(index % 2 === 0 ? '#F5F3FF' : lightPurple);
    doc.fontSize(9).fillColor('black').font('Helvetica');

    doc.text(String(index + 1), col1X + 5, yPos + 8, { width: 25 });
    doc.text(payment.date || '-', col2X + 5, yPos + 8, { width: 70 });
    doc.text(payment.description || '-', col3X + 5, yPos + 8, { width: 90 });
    doc.text(payment.paidBy || '-', col4X + 5, yPos + 8, { width: 60 });

    const amount = parseFloat(payment.amount) || 0;
    totalAmount += amount;
    doc.text(amount > 0 ? `LKR ${amount.toLocaleString()}` : '-', col5X + 5, yPos + 8, { width: 80 });

    yPos += 25;
  });

  doc.rect(col4X, yPos, doc.page.width - col4X - 30, 25).fill(lightPurple);
  doc.fontSize(10).fillColor('black').font('Helvetica-Bold');
  doc.text(`LKR ${totalAmount.toLocaleString()}`, col5X + 5, yPos + 8, { width: 80 });

  // Thank you + seal
  yPos += 50;
  doc.fontSize(11).fillColor('black').font('Helvetica')
    .text('Thank you for your payment', 30, yPos, { align: 'center', width: doc.page.width - 60 });

  yPos += 25;
  if (fs.existsSync(sealPngPath)) {
    try {
      const sealSize = 80;
      const sealX = (doc.page.width / 2) - (sealSize / 2) + 30;
      doc.image(sealPngPath, sealX, yPos, { width: sealSize, height: sealSize });
      yPos += sealSize + 10;
    } catch (err) {
      // ignore
    }
  }

  // Footer
  const footerY = doc.page.height - 90;
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

  doc.fontSize(10).fillColor('black').font('Helvetica-Bold')
    .text('UNIVERSAL COLLEGE OF APPLIED & GENERAL STUDIES', 20, footerY + 9, {
      align: 'center',
      width: doc.page.width - 40
    });

  const contactY = footerY + collegeTitleHeight;
  doc.fontSize(8).fillColor('white').font('Helvetica');
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

// Get next receipt number
router.get('/next-number', isAdmin, (req, res) => {
  try {
    const receiptNumber = generateReceiptNumber();
    res.json({
      success: true,
      receiptNumber
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
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
    const studentId = (registration?.student_id || payload.student_id || '');
    const enrolledProgram = registration?.program_name || payload.program_name || payload.course_program || payment.program_name || '';
    const paymentPlan = payment.payment_plan || '';

    const payments = [
      {
        date: payment.payment_date || finalReceiptDate,
        description: payment.payment_plan ? `Payment (${payment.payment_plan})` : 'Payment',
        paidBy: payment.confirmed_by || 'Student',
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

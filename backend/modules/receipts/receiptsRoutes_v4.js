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

    // UCAGS Purple color
    const purple = '#5B2C6F';
    const lightPurple = '#E8DFF5';

    // Header - Purple background
    doc.rect(0, 0, doc.page.width, 70).fill(purple);

    // Add PNG logo on the right first (even bigger)
    const logoPngPath = path.join(__dirname, '../../../logo.png');
    let logoHeight = 60;
    
    if (fs.existsSync(logoPngPath)) {
      try {
        // Use fit option to maintain aspect ratio - even bigger
        doc.image(logoPngPath, doc.page.width - 145, 8, { fit: [130, 60] });
      } catch (err) {
        console.log('Logo not loaded:', err.message);
      }
    } else {
      console.log('Logo file not found at:', logoPngPath);
    }

    // "RECEIPT" text on left - aligned vertically with logo center
    const titleY = 8 + (logoHeight / 2) - 12; // Align with logo vertical center
    doc.fontSize(32)
       .fillColor('white')
       .font('Helvetica') // Using Helvetica as closest to Avenir-Roman
       .text('RECEIPT', 30, titleY);

    // Light purple info box with rounded corner on top-right only
    const boxY = 70;
    const boxHeight = 120; // Increased to fit all student details
    const cornerRadius = 15;
    
    console.log('Drawing rounded box at Y:', boxY, 'width:', doc.page.width, 'radius:', cornerRadius);
    
    // Draw small purple triangle behind ONLY the top-right rounded corner
    doc.fillColor(purple);
    doc.moveTo(doc.page.width - cornerRadius, boxY)
       .lineTo(doc.page.width, boxY)
       .lineTo(doc.page.width, boxY + cornerRadius)
       .closePath()
       .fill();
    
    // Now draw light purple box on top with rounded top-right corner only
    doc.fillColor(lightPurple);
    
    // Draw rectangle with rounded top-right corner only
    doc.moveTo(0, boxY)
       .lineTo(doc.page.width - cornerRadius, boxY)
       .quadraticCurveTo(doc.page.width, boxY, doc.page.width, boxY + cornerRadius)
       .lineTo(doc.page.width, boxY + boxHeight)
       .lineTo(0, boxY + boxHeight)
       .closePath()
       .fill();
    
    console.log('✅ Rounded box drawn');

    // Receipt details (with more line spacing)
    let yPos = 82;
    doc.fontSize(11)
       .fillColor('black')
       .font('Helvetica');

    doc.text(`Receipt No: ${finalReceiptNumber}`, 30, yPos);
    yPos += 18;
    doc.text(`Receipt Date: ${formatDate(finalReceiptDate)}`, 30, yPos);
    yPos += 18;
    doc.text(`Student: ${studentName}`, 30, yPos);
    yPos += 18;
    doc.text(`Student ID: ${studentId}`, 30, yPos);
    yPos += 18;
    doc.text(`Enrolled program: ${enrolledProgram}`, 30, yPos);
    yPos += 18;
    doc.text(`Payment plan: ${paymentPlan}`, 30, yPos);

    // Payment table
    yPos = 200;
    
    // Table header (adjusted for 420pt width)
    const tableTop = yPos;
    const col1X = 30;
    const col2X = 60;
    const col3X = 140;
    const col4X = 240;
    const col5X = 310;

    // Header background
    doc.rect(col1X, tableTop, doc.page.width - 60, 35).fill(purple);

    // Draw white grid lines in header
    doc.strokeColor('white').lineWidth(1);
    doc.moveTo(col2X, tableTop).lineTo(col2X, tableTop + 35).stroke();
    doc.moveTo(col3X, tableTop).lineTo(col3X, tableTop + 35).stroke();
    doc.moveTo(col4X, tableTop).lineTo(col4X, tableTop + 35).stroke();
    doc.moveTo(col5X, tableTop).lineTo(col5X, tableTop + 35).stroke();

    // Header text
    doc.fontSize(9)
       .fillColor('white')
       .font('Helvetica');
    
    doc.text('No', col1X + 5, tableTop + 12, { width: 25 });
    doc.text('Date', col2X + 5, tableTop + 12, { width: 70 });
    doc.text('Description', col3X + 5, tableTop + 12, { width: 90 });
    doc.text('Paid by', col4X + 5, tableTop + 12, { width: 60 });
    doc.text('Amount', col5X + 5, tableTop + 12, { width: 80 });

    // Table rows with white grid lines
    yPos += 35;
    let totalAmount = 0;
    const rowHeight = 30; // Increased row height for more spacing

    payments.forEach((payment, index) => {
      // Alternate row colors
      if (index % 2 === 0) {
        doc.rect(col1X, yPos, doc.page.width - 60, rowHeight).fill('#F5F3FF');
      } else {
        doc.rect(col1X, yPos, doc.page.width - 60, rowHeight).fill('#E8DFF5');
      }

      // Draw white grid lines (vertical separators)
      doc.strokeColor('white').lineWidth(1);
      doc.moveTo(col2X, yPos).lineTo(col2X, yPos + rowHeight).stroke();
      doc.moveTo(col3X, yPos).lineTo(col3X, yPos + rowHeight).stroke();
      doc.moveTo(col4X, yPos).lineTo(col4X, yPos + rowHeight).stroke();
      doc.moveTo(col5X, yPos).lineTo(col5X, yPos + rowHeight).stroke();

      doc.fontSize(9)
         .fillColor('black')
         .font('Helvetica');

      doc.text((index + 1).toString(), col1X + 5, yPos + 10, { width: 25 });
      doc.text(payment.date || '-', col2X + 5, yPos + 10, { width: 70 });
      doc.text(payment.description || '-', col3X + 5, yPos + 10, { width: 90 });
      doc.text(payment.paidBy || '-', col4X + 5, yPos + 10, { width: 60 });
      
      const amount = parseFloat(payment.amount) || 0;
      totalAmount += amount;
      doc.text(amount > 0 ? `LKR ${amount.toLocaleString()}` : '-', col5X + 5, yPos + 10, { width: 80 });

      yPos += rowHeight;
    });

    // Total row
    doc.rect(col4X, yPos, doc.page.width - col4X - 30, 30).fill(lightPurple);
    
    // Draw white grid line in total row
    doc.strokeColor('white').lineWidth(1);
    doc.moveTo(col5X, yPos).lineTo(col5X, yPos + 30).stroke();
    
    doc.fontSize(10)
       .fillColor('black')
       .font('Helvetica');
    doc.text(`LKR ${totalAmount.toLocaleString()}`, col5X + 5, yPos + 10, { width: 80 });

    // Thank you message
    yPos += 50;
    doc.fontSize(11)
       .fillColor('black')
       .font('Helvetica')
       .text('Thank you for your payment', 30, yPos, { align: 'center', width: doc.page.width - 60 });
    
    // Add seal image below thank you message (positioned more to the right)
    yPos += 20;
    const sealPath = path.join(__dirname, '../../../seal.png');
    if (fs.existsSync(sealPath)) {
      try {
        const sealSize = 100;
        const sealX = doc.page.width - sealSize - 50; // Almost close to right edge
        doc.image(sealPath, sealX, yPos, { width: sealSize, height: sealSize });
        yPos += sealSize + 15; // Reduced space after seal
      } catch (err) {
        console.log('Seal image not loaded:', err.message);
      }
    } else {
      // If no seal, add some space
      yPos += 20;
    }

    // Footer - Redesigned: Top block (college name), Bottom block (contact) overlaps
    const footerRadius = 15;
    
    // Calculate dynamic footer position based on content
    // Minimum space between content and footer
    const minSpaceBeforeFooter = 30;
    const footerHeight = 80;
    const dynamicFooterY = Math.max(yPos + minSpaceBeforeFooter, doc.page.height - footerHeight);
    
    console.log('Drawing rounded footer at dynamic Y:', dynamicFooterY, 'content ends at:', yPos);
    
    // Top block - College name (light purple) with rounded top corners
    const collegeBoxY = dynamicFooterY;
    const collegeBoxHeight = 35;
    
    doc.fillColor(lightPurple);
    doc.moveTo(0, collegeBoxY + footerRadius)
       .quadraticCurveTo(0, collegeBoxY, footerRadius, collegeBoxY)
       .lineTo(doc.page.width - footerRadius, collegeBoxY)
       .quadraticCurveTo(doc.page.width, collegeBoxY, doc.page.width, collegeBoxY + footerRadius)
       .lineTo(doc.page.width, collegeBoxY + collegeBoxHeight)
       .lineTo(0, collegeBoxY + collegeBoxHeight)
       .closePath()
       .fill();
    
    // College name
    doc.fontSize(10)
       .fillColor('black')
       .font('Helvetica')
       .text('UNIVERSAL COLLEGE OF APPLIED & GENERAL STUDIES', 20, collegeBoxY + 11, {
         align: 'center',
         width: doc.page.width - 40
       });
    
    // Bottom block - Contact info (purple) with rounded top corners, overlaps college box
    const contactBoxY = collegeBoxY + 25; // Overlaps the college box
    const contactBoxHeight = 60;
    
    doc.fillColor(purple);
    doc.moveTo(0, contactBoxY + footerRadius)
       .quadraticCurveTo(0, contactBoxY, footerRadius, contactBoxY)
       .lineTo(doc.page.width - footerRadius, contactBoxY)
       .quadraticCurveTo(doc.page.width, contactBoxY, doc.page.width, contactBoxY + footerRadius)
       .lineTo(doc.page.width, doc.page.height)
       .lineTo(0, doc.page.height)
       .closePath()
       .fill();
    
    // Contact info
    doc.fontSize(8)
       .fillColor('white')
       .font('Helvetica');

    const contactTextY = contactBoxY + 18;
    doc.text('Corporate Office: 190 A Anagarika Dharmapala Mawatha (Allen Avenue), Dehiwala, Sri Lanka', 20, contactTextY, {
      align: 'center',
      width: doc.page.width - 40
    });

    doc.text('Hotline: +94 76 331 3333    Email: study@ucags.com    Website: https://ucags.edu.lk/', 20, contactTextY + 12, {
      align: 'center',
      width: doc.page.width - 40
    });
    
    console.log('✅ Rounded footer drawn');

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

module.exports = router;

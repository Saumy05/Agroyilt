const PDFDocument = require('pdfkit');

/**
 * Generate Invoice PDF
 * @param {Object} bill - VendorBill document
 * @param {Object} booking - Booking document
 * @param {Stream} res - Express response stream
 * @param {Object} settings - Global Settings (Billing & Company Details from admin settings)
 */
const generateInvoicePDF = (bill, booking, res, settings = {}) => {
    const doc = new PDFDocument({ margin: 50 });

    // Pipe to response
    doc.pipe(res);

    const companyName = settings.companyName || settings.appName || 'AgroYilt';
    const cityLine = [settings.companyCity, settings.companyState, settings.companyPincode].filter(Boolean).join(', ');
    const contactLine = [settings.companyPhone, settings.companyEmail].filter(Boolean).join(' | ');
    const taxLine = [settings.companyGSTIN && `GSTIN: ${settings.companyGSTIN}`, settings.companyPAN && `PAN: ${settings.companyPAN}`].filter(Boolean).join('   ');
    const invoiceNumber = `${settings.invoicePrefix ? `${settings.invoicePrefix}-` : ''}${booking.bookingNumber}`;

    // --- Header ---
    doc.fillColor('#444444')
        .fontSize(18)
        .text(companyName, 50, 40, { width: 330 })
        .fontSize(8);
    let headerY = 62;
    [settings.companyAddress, cityLine, contactLine, taxLine].filter(Boolean).forEach(line => {
        doc.text(line, 50, headerY, { width: 330 });
        headerY += 11;
    });
    doc.fillColor('#000000')
        .fontSize(20)
        .text('INVOICE', 200, 45, { align: 'right' });

    const dividerY = Math.max(90, headerY + 6);
    doc.strokeColor('#aaaaaa').lineWidth(1).moveTo(50, dividerY).lineTo(550, dividerY).stroke();

    // --- Info Section ---
    const infoTop = dividerY + 20;
    doc.fontSize(10)
        .font('Helvetica-Bold').text('Invoice Number:', 50, infoTop)
        .font('Helvetica').text(invoiceNumber, 150, infoTop)
        .font('Helvetica-Bold').text('Invoice Date:', 50, infoTop + 15)
        .font('Helvetica').text(new Date(bill.generatedAt).toLocaleDateString('en-IN'), 150, infoTop + 15)
        .font('Helvetica-Bold').text('Booking Status:', 50, infoTop + 30)
        .font('Helvetica').text(booking.status.toUpperCase(), 150, infoTop + 30);
    if (settings.sacCode) {
        doc.font('Helvetica-Bold').text('SAC Code:', 50, infoTop + 45)
            .font('Helvetica').text(settings.sacCode, 150, infoTop + 45);
    }

    doc.font('Helvetica-Bold').text('Bill To:', 350, infoTop)
        .font('Helvetica').text(booking.userId?.name || 'Valued Farmer', 350, infoTop + 15)
        .text(booking.userId?.phone || '', 350, infoTop + 30)
        .text(booking.address?.addressLine1 || '', 350, infoTop + 45, { width: 200 });

    // --- Agri Specific Details ---
    if (booking.serviceCategory === 'Agriculture' || booking.categoryId?.title === 'Agriculture' || booking.cropType || booking.landSize) {
        let agriTop = infoTop + 65;
        if (booking.cropType) {
            doc.font('Helvetica-Bold').fontSize(9).text('Crop Type:', 50, agriTop)
                .font('Helvetica').text(booking.cropType, 110, agriTop);
            agriTop += 12;
        }
        if (booking.landSize) {
            doc.font('Helvetica-Bold').fontSize(9).text('Land Area:', 50, agriTop)
                .font('Helvetica').text(booking.landSize, 110, agriTop);
        }
    }

    doc.moveDown(4);

    // --- Table Header ---
    const tableTop = infoTop + 95;
    doc.font('Helvetica-Bold')
        .text('Description', 50, tableTop)
        .text('Qty', 280, tableTop)
        .text('Rate', 330, tableTop)
        .text('GST %', 400, tableTop)
        .text('Amount', 480, tableTop, { align: 'right' });

    doc.strokeColor('#aaaaaa').lineWidth(1).moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke();

    let y = tableTop + 30;

    // --- Services ---
    bill.services.forEach(item => {
        doc.font('Helvetica').fontSize(9)
            .text(item.name, 50, y, { width: 220 })
            .text(item.quantity, 280, y)
            .text(`Rs. ${item.price}`, 330, y)
            .text(`${item.gstPercentage}%`, 400, y)
            .text(`Rs. ${item.total}`, 480, y, { align: 'right' });
        y += 20;
    });

    // --- Parts ---
    bill.parts.forEach(item => {
        doc.text(item.name, 50, y, { width: 220 })
            .text(item.quantity, 280, y)
            .text(`Rs. ${item.price}`, 330, y)
            .text(`${item.gstPercentage}%`, 400, y)
            .text(`Rs. ${item.total}`, 480, y, { align: 'right' });
        y += 20;
    });

    // --- Custom Items ---
    bill.customItems.forEach(item => {
        doc.text(item.name, 50, y, { width: 220 })
            .text(item.quantity, 280, y)
            .text(`Rs. ${item.price}`, 330, y)
            .text(`${item.gstPercentage}%`, 400, y)
            .text(`Rs. ${item.total}`, 480, y, { align: 'right' });
        y += 20;
    });

    // --- Transport/Visiting ---
    if (bill.visitingCharges > 0) {
        doc.text('Visiting/Service Charges', 50, y)
            .text('1', 280, y)
            .text(`Rs. ${bill.visitingCharges}`, 330, y)
            .text('0%', 400, y)
            .text(`Rs. ${bill.visitingCharges}`, 480, y, { align: 'right' });
        y += 20;
    }

    if (bill.transportCharges > 0) {
        doc.text('Transport Charges', 50, y)
            .text('1', 280, y)
            .text(`Rs. ${bill.transportCharges}`, 330, y)
            .text('0%', 400, y)
            .text(`Rs. ${bill.transportCharges}`, 480, y, { align: 'right' });
        y += 20;
    }

    // --- Totals ---
    const subtotalOver = y + 20;
    doc.strokeColor('#aaaaaa').lineWidth(1).moveTo(350, subtotalOver).lineTo(550, subtotalOver).stroke();

    doc.font('Helvetica-Bold').fontSize(10)
        .text('Subtotal:', 350, subtotalOver + 15)
        .font('Helvetica').text(`Rs. ${(bill.totalServiceBase + bill.totalPartsBase + bill.visitingCharges + bill.transportCharges).toFixed(2)}`, 480, subtotalOver + 15, { align: 'right' })

        .font('Helvetica-Bold').text('Total GST:', 350, subtotalOver + 30)
        .font('Helvetica').text(`Rs. ${bill.totalGST.toFixed(2)}`, 480, subtotalOver + 30, { align: 'right' })

        .fontSize(12)
        .font('Helvetica-Bold').text('Grand Total:', 350, subtotalOver + 50)
        .fillColor('#00a6a6')
        .text(`Rs. ${bill.grandTotal.toFixed(2)}`, 480, subtotalOver + 50, { align: 'right' });

    // --- Vendor Settlement Summary ---
    if (bill.vendorTotalEarning !== undefined) {
        let vsY = subtotalOver + 85;
        
        // Reset color
        doc.fillColor('#000000');
        
        // Divider
        doc.strokeColor('#e5e7eb').lineWidth(1).moveTo(50, vsY).lineTo(550, vsY).stroke();
        
        vsY += 15;
        doc.font('Helvetica-Bold').fontSize(11).fillColor('#374151')
           .text('Vendor Settlement Summary', 50, vsY);
           
        vsY += 20;
        doc.font('Helvetica').fontSize(9).fillColor('#4b5563')
           .text('Total Service & Parts Base (excl. GST):', 50, vsY)
           .text(`Rs. ${(bill.totalServiceBase + bill.totalPartsBase).toFixed(2)}`, 480, vsY, { align: 'right' });
           
        vsY += 15;
        const totalDeductions = (bill.totalServiceBase + bill.totalPartsBase) - bill.vendorTotalEarning;
        doc.text('Platform Commission Deducted:', 50, vsY)
           .fillColor('#ef4444').text(`- Rs. ${totalDeductions.toFixed(2)}`, 480, vsY, { align: 'right' });
           
        vsY += 20;
        doc.font('Helvetica-Bold').fontSize(10).fillColor('#10b981')
           .text('Total Net Earnings:', 50, vsY)
           .text(`Rs. ${bill.vendorTotalEarning.toFixed(2)}`, 480, vsY, { align: 'right' });
    }

    // --- Footer ---
    doc.fillColor('#888888')
        .fontSize(8)
        .text('This is a computer generated invoice and does not require a physical signature.', 50, 700, { align: 'center', width: 500 })
        .text(`Thank you for choosing ${companyName} for your farming needs!`, 50, 715, { align: 'center', width: 500 });

    doc.end();
};

module.exports = { generateInvoicePDF };

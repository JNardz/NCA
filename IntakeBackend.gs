/* ==================================================
   INTAKE PROCESS (SAVE & GENERATE RECEIPT)
   ================================================== */
function processIntakeForm(formData) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const dbInv = ss.getSheetByName(CONFIG.SHEETS.DB_INV);

    try {
        if (!formData.consignorId || !formData.name) throw new Error("Consignor is required.");
        if (!formData.auctionId) throw new Error("Target Auction is required.");

        const currentAuction = formData.auctionId;
        let newRows = [];
        const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "MM/dd/yyyy");

        const existingIds = new Set(dbInv.getDataRange().getValues().map(r => String(r[0])));

        formData.items.forEach(item => {
            const primaryImage = item.img1 || item.img2 || item.img3 || "";
            let noteText = item.notes || "";

            const initialNotes = [
                { text: "CREATED [SYSTEM]", time: timestamp, user: formData.user || "Intake" }
            ];
            if (noteText) initialNotes.push({ text: noteText, time: timestamp, user: formData.user || "Intake" });

            let invId;
            do { invId = Math.floor(Math.random() * 90000000) + 10000000; } while (existingIds.has(String(invId)));
            existingIds.add(String(invId));

            item.generatedId = invId;

            const lotNumber = "";

            newRows.push([
                invId, currentAuction, formData.consignorId, "", item.year, item.make, item.model, item.vin, "",
                item.desc, item.title, "", item.reserve,
                "", primaryImage,
                JSON.stringify(initialNotes), "Active", timestamp, lotNumber, item.lotType
            ]);
        });

        if (newRows.length > 0) {
            dbInv.getRange(dbInv.getLastRow() + 1, 1, newRows.length, newRows[0].length).setValues(newRows);
        } else {
            return { success: false, message: "No items added." };
        }

        return {
            success: true,
            message: `Saved ${newRows.length} items to Auction ${currentAuction}.`,
            receiptData: formData
        };
    } catch (err) {
        return { success: false, message: "Database Error: " + err.message };
    }
}

function addImagesToLot(lotId, newUrls) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const dbInv = ss.getSheetByName(CONFIG.SHEETS.DB_INV);
    const data = dbInv.getDataRange().getValues();

    for (let i = 0; i < data.length; i++) {
        if (String(data[i][0]) === String(lotId)) {
            const currentImagesStr = String(data[i][14] || "");
            let imageList = currentImagesStr ? currentImagesStr.split(',') : [];
            if (Array.isArray(newUrls)) {
                imageList = imageList.concat(newUrls);
            } else if (newUrls) {
                imageList.push(newUrls);
            }
            imageList = [...new Set(imageList.filter(url => url && url.trim() !== ""))];
            dbInv.getRange(i + 1, 15).setValue(imageList.join(','));
            return "Images Saved";
        }
    }
    throw new Error("Lot not found");
}

/* ==================================================
   MODULAR RECEIPT GENERATION (FIXED)
   ================================================== */
function createReceiptSheet(data) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // 1. Fetch Templates
    const tHeader = ss.getSheetByName(CONFIG.SHEETS.TEMPLATE_HEADER);
    const tTabHead = ss.getSheetByName(CONFIG.SHEETS.TEMPLATE_TABLE_HEADER);
    const tItem = ss.getSheetByName(CONFIG.SHEETS.TEMPLATE_ITEM);
    const tFooter = ss.getSheetByName(CONFIG.SHEETS.TEMPLATE_FOOTER);
    const tEnd = ss.getSheetByName(CONFIG.SHEETS.TEMPLATE_END);

    if (!tHeader || !tTabHead || !tItem || !tFooter || !tEnd) {
        throw new Error("Missing one or more Receipt Templates.");
    }

    // 2. Get Dimensions
    const hRows = tHeader.getMaxRows();
    const thRows = tTabHead.getMaxRows();
    const iRows = tItem.getMaxRows();
    const fRows = tFooter.getMaxRows();
    const eRows = tEnd.getMaxRows();

    // Find widest template to prevent column errors
    const maxCols = Math.max(
        tHeader.getMaxColumns(), tTabHead.getMaxColumns(), tItem.getMaxColumns(),
        tFooter.getMaxColumns(), tEnd.getMaxColumns()
    );

    // Configuration for Page Size (Rows per Page)
    const MAX_ROWS = 44;

    // 3. Name Formatting Logic
    let headerName = data.name || "";
    if (data.business && data.business.trim() !== "") {
        if (data.name && data.name.trim() !== "") {
            headerName = `${data.business} / ${data.name}`;
        } else {
            headerName = data.business;
        }
    }

    // 4. Page Simulation
    let pages = [];
    let currentPageItems = [];
    let currentHeight = hRows + thRows;

    // A. Place Items
    data.items.forEach(item => {
        if (currentHeight + iRows + fRows > MAX_ROWS) {
            pages.push({ items: currentPageItems, hasEnd: false });
            currentPageItems = [item];
            currentHeight = hRows + thRows + iRows;
        } else {
            currentPageItems.push(item);
            currentHeight += iRows;
        }
    });

    // B. Place End Block
    if (currentHeight + eRows + fRows <= MAX_ROWS) {
        pages.push({ items: currentPageItems, hasEnd: true });
    } else {
        // If End block fits on new page with at least one item moved
        if (currentPageItems.length > 0) {
            const movedItem = currentPageItems.pop();
            pages.push({ items: currentPageItems, hasEnd: false });
            pages.push({ items: [movedItem], hasEnd: true });
        } else {
            pages.push({ items: currentPageItems, hasEnd: false });
            pages.push({ items: [], hasEnd: true });
        }
    }

    // 5. Render
    const timestamp = new Date().getTime();
    const sheetName = `Rcpt_${data.consignorId}_${timestamp}`;
    const newSheet = tHeader.copyTo(ss).setName(sheetName);
    newSheet.clearContents();
    newSheet.clearFormats();

    // FIX 1: Ensure columns exist
    if (newSheet.getMaxColumns() < maxCols) {
        newSheet.insertColumnsAfter(newSheet.getMaxColumns(), maxCols - newSheet.getMaxColumns());
    }

    let writeRow = 1;
    const totalPages = pages.length;

    pages.forEach((page, index) => {
        const pageNum = index + 1;

        // --- A. HEADER ---
        tHeader.getDataRange().copyTo(newSheet.getRange(writeRow, 1));
        newSheet.getRange(writeRow, 1).setValue(data.consignorId);
        newSheet.getRange(writeRow, 7).setValue(Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "MM/dd/yyyy"));
        newSheet.getRange(writeRow + 2, 1).setValue(headerName);
        newSheet.getRange(writeRow + 2, 6).setValue(data.phone);
        newSheet.getRange(writeRow + 4, 1).setValue(data.address);
        writeRow += hRows;

        // --- B. TABLE HEADER ---
        tTabHead.getDataRange().copyTo(newSheet.getRange(writeRow, 1));
        writeRow += thRows;

        // --- C. ITEMS ---
        page.items.forEach(item => {
            tItem.getDataRange().copyTo(newSheet.getRange(writeRow, 1));
            // A1: Title
            newSheet.getRange(writeRow, 1).setValue(item.title || "");
            // B1: Inv ID
            newSheet.getRange(writeRow, 2).setValue("#" + item.generatedId);
            // C1: Desc
            newSheet.getRange(writeRow, 3).setValue(item.desc || "");
            // D1: VIN
            const vinText = item.vin ? `VIN/SN: ${item.vin}` : "";
            newSheet.getRange(writeRow, 4).setValue(vinText);
            // E1: Reserve
            if (item.reserve) newSheet.getRange(writeRow, 5).setValue(item.reserve);

            writeRow += iRows;
        });

        // Calculate Footer Position
        const pageStartRow = ((pageNum - 1) * MAX_ROWS) + 1;
        const footerStartRow = pageStartRow + MAX_ROWS - fRows;

        // FIX 2: Ensure rows exist before pasting Footer/End
        // The footer ends at footerStartRow + fRows - 1. We need to make sure the sheet is that deep.
        const neededRows = (footerStartRow + fRows) - newSheet.getMaxRows();
        if (neededRows > 0) {
            newSheet.insertRowsAfter(newSheet.getMaxRows(), neededRows);
        }

        // --- D. END BLOCK ---
        if (page.hasEnd) {
            const endBlockRow = footerStartRow - eRows;
            tEnd.getDataRange().copyTo(newSheet.getRange(endBlockRow, 1));

            // F4: Owner Name
            newSheet.getRange(endBlockRow + 3, 6).setValue(data.signatureName);
            // F7: Received By
            newSheet.getRange(endBlockRow + 6, 6).setValue(data.user);

            // A3: Signature Image
            if (data.signatureImage) {
                try {
                    var base64 = data.signatureImage.split(',')[1];
                    var decoded = Utilities.base64Decode(base64);
                    var blob = Utilities.newBlob(decoded, 'image/png', 'signature.png');
                    var img = SpreadsheetApp.newCellImage().setSource(blob).build();
                    newSheet.getRange(endBlockRow + 2, 1).setValue(img);
                } catch (e) { console.error("Sig Error", e); }
            }
        }

        // --- E. FOOTER ---
        tFooter.getDataRange().copyTo(newSheet.getRange(footerStartRow, 1));
        newSheet.getRange(footerStartRow, 7).setValue(`Page: ${pageNum} / ${totalPages}`);

        writeRow = pageStartRow + MAX_ROWS;
    });

    SpreadsheetApp.flush();

    const pdfUrl = "https://docs.google.com/spreadsheets/d/" + ss.getId() + "/export?format=pdf&gid=" + newSheet.getSheetId() + "&size=letter&portrait=true&fitw=true&gridlines=false&printtitle=false&sheetnames=false&pagenum=UNDEFINED&attachment=false";

    const dbRcpt = ss.getSheetByName(CONFIG.SHEETS.DB_RCPT);
    if (dbRcpt) {
        dbRcpt.appendRow([
            "RCPT-" + timestamp,
            data.consignorId,
            Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "MM/dd/yyyy"),
            pdfUrl,
            sheetName
        ]);
    }

    return { url: pdfUrl, sheetName: sheetName };
}

function createLabelSheet(lotIds) {
    if (!Array.isArray(lotIds)) lotIds = [lotIds];
    if (lotIds.length === 0) throw new Error("No IDs provided for labels.");

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const template = ss.getSheetByName(CONFIG.SHEETS.TEMPLATE_LABEL);
    const dbInv = ss.getSheetByName(CONFIG.SHEETS.DB_INV);
    const dbAuc = ss.getSheetByName(CONFIG.SHEETS.DB_AUC);

    if (!template) throw new Error("Template_Label_Inventory missing.");
    const invData = dbInv.getDataRange().getValues();
    const aucData = dbAuc ? dbAuc.getDataRange().getValues() : [];
    const timestamp = new Date().getTime();
    const labelSheetName = `Labels_${timestamp}`;
    let labelSheet = template.copyTo(ss).setName(labelSheetName);

    const getItem = (id) => {
        for (let i = 1; i < invData.length; i++) {
            if (String(invData[i][0]) === String(id)) {
                return {
                    id: invData[i][0],
                    aucId: invData[i][1],
                    conId: invData[i][2],
                    vin: invData[i][7],
                    desc: invData[i][9]
                };
            }
        }
        return null;
    };

    const getAuctionHeader = (aucId) => {
        for (let i = 1; i < aucData.length; i++) {
            if (String(aucData[i][0]) === String(aucId)) {
                const d1 = new Date(aucData[i][2]);
                const d2 = new Date(aucData[i][3]);
                const f1 = Utilities.formatDate(d1, Session.getScriptTimeZone(), "M/d");
                const f2 = Utilities.formatDate(d2, Session.getScriptTimeZone(), "M/d");
                if (f1 === f2) return `AUCTION ${f1}`;
                return `AUCTION ${f1}-${f2}`;
            }
        }
        return "AUCTION";
    };

    const templateRange = template.getDataRange();
    const numRows = templateRange.getNumRows();
    const spacing = 1;
    const rowHeights = [];
    for (let r = 1; r <= numRows; r++) { rowHeights.push(template.getRowHeight(r)); }

    for (let k = 0; k < lotIds.length; k++) {
        const item = getItem(lotIds[k]);
        if (!item) continue;
        let startRow = 1 + (k * (numRows + spacing));
        if (k > 0) templateRange.copyTo(labelSheet.getRange(startRow, 1));
        for (let h = 0; h < numRows; h++) { labelSheet.setRowHeight(startRow + h, rowHeights[h]); }

        const headerTxt = getAuctionHeader(item.aucId);
        const conTxt = "C-" + item.conId;
        const invTxt = "INV# " + item.id;
        const itemName = item.desc || "";
        const vinTxt = item.vin ? "VIN/SN: " + item.vin : "";
        const barcodeUrl = `https://bwipjs-api.metafloor.com/?bcid=code128&text=${item.id}&scale=3&height=6`;
        const colMap = { A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7 };
        const setCell = (def, val, isFormula) => {
            if (!def) return;
            const colChar = def.charAt(0);
            const rowNum = parseInt(def.substring(1));
            const actualRow = startRow + rowNum - 1;
            const cell = labelSheet.getRange(actualRow, colMap[colChar]);
            if (isFormula) cell.setFormula(val);
            else cell.setValue(val);
        };

        setCell(CONFIG.LABEL.CELL_HEADER, headerTxt, false);
        setCell(CONFIG.LABEL.CELL_CON, conTxt, false);
        setCell(CONFIG.LABEL.CELL_INV, invTxt, false);
        setCell(CONFIG.LABEL.CELL_BARCODE, `=IMAGE("${barcodeUrl}")`, true);
        setCell(CONFIG.LABEL.CELL_ITEM_NAME, itemName, false);
        setCell(CONFIG.LABEL.CELL_VIN, vinTxt, false);
    }

    SpreadsheetApp.flush();
    const pdfUrl = "https://docs.google.com/spreadsheets/d/" + ss.getId() + "/export?format=pdf&gid=" + labelSheet.getSheetId() + "&size=letter&portrait=true&fitw=true&gridlines=false&printtitle=false&sheetnames=false&pagenum=UNDEFINED&attachment=false";
    return { url: pdfUrl, sheetName: labelSheetName };
}

function deleteReceiptSheet(sheetName) {
    try {
        const ss = SpreadsheetApp.getActiveSpreadsheet();
        const sheet = ss.getSheetByName(sheetName); if (sheet) ss.deleteSheet(sheet); return "Cleaned up";
    } catch (e) {
        return "Error cleaning up: " + e.message;
    }
}

function uploadIntakeImage(data) {
    try {
        const folders = DriveApp.getFoldersByName(CONFIG.FOLDER_NAME);
        let folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(CONFIG.FOLDER_NAME);
        folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        const bytes = Utilities.base64Decode(data.substr(data.indexOf('base64,') + 7));
        const blob = Utilities.newBlob(bytes, data.substring(5, data.indexOf(';')), "intake_" + new Date().getTime() + ".jpg");
        const file = folder.createFile(blob);
        return "https://drive.google.com/uc?export=view&id=" + file.getId();
    } catch (e) {
        return "ERROR: " + e.toString();
    }
}
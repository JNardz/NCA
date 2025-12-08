/* ==================================================
   LOT & CONSIGNOR VIEWERS
   ================================================== */

// UPDATED: Optimizes Image for List View (First Image Only, Small Thumbnail)
function getAllLots() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const dbInv = ss.getSheetByName(CONFIG.SHEETS.DB_INV);
    const dbAuc = ss.getSheetByName(CONFIG.SHEETS.DB_AUC);
    
    if (!dbInv) return "[]";
    
    let aucData = [];
    if (dbAuc && dbAuc.getLastRow() > 1) {
      aucData = dbAuc.getDataRange().getValues();
    }
    
    const auctionLotMaps = {}; 
    for(let a=1; a<aucData.length; a++) {
       try {
          if (aucData[a][7]) auctionLotMaps[String(aucData[a][0])] = JSON.parse(aucData[a][7]);
       } catch(e) {}
    }

    if (dbInv.getLastRow() <= 1) return "[]";
    const data = dbInv.getDataRange().getValues();
    data.shift(); 
    
    const cleanData = data.map(row => {
      const invId = String(row[0] || "");
      const aucId = String(row[1] || "");
      
      let displayLotNum = ""; 
      if (auctionLotMaps[aucId] && auctionLotMaps[aucId][invId]) {
          displayLotNum = auctionLotMaps[aucId][invId];
      }
      
      // IMAGE OPTIMIZATION
      let thumbUrl = "";
      const rawImages = String(row[14] || ""); // Col 15
      if (rawImages) {
          const firstImg = rawImages.split(',')[0].trim();
          // Convert Drive View URL to Thumbnail URL
          if(firstImg.includes("drive.google.com")) {
             // Extract ID. Supports 'id=' format.
             const idMatch = firstImg.match(/id=([^&]+)/);
             if(idMatch) {
                 thumbUrl = "https://drive.google.com/thumbnail?id=" + idMatch[1] + "&sz=w250"; // Small width
             } else {
                 thumbUrl = firstImg; // Fallback
             }
          } else {
              thumbUrl = firstImg;
          }
      }

      return {
        lotId: invId, 
        lotNumber: displayLotNum, 
        auction: aucId, 
        conId: String(row[2] || ""),
        type: String(row[3] || ""), 
        year: String(row[4] || ""), 
        make: String(row[5] || ""),
        model: String(row[6] || ""), 
        vin: String(row[7] || ""), 
        mileage: String(row[8] || ""),
        desc: String(row[9] || ""), 
        title: String(row[10] || ""), 
        payment: String(row[11] || ""),
        reserve: String(row[12] || ""), 
        transporter: String(row[13] || ""), 
        image: thumbUrl, // THUMBNAIL ONLY
        // notes removed to save bandwidth on list, fetched in detail
        status: String(row[16] || "Active"), 
        date: String(row[17] || ""),
        lotType: String(row[19] || "Other") 
      };
    });
    
    return JSON.stringify(cleanData);
    
  } catch (e) { 
    console.error("getAllLots Error: " + e.message);
    return JSON.stringify([]); 
  }
}

// NEW: Fetches Full Details for Single Lot (High Res Images)
function getLotDetails(lotId) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const dbInv = ss.getSheetByName(CONFIG.SHEETS.DB_INV);
    const dbAuc = ss.getSheetByName(CONFIG.SHEETS.DB_AUC);
    
    const data = dbInv.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
        if (String(data[i][0]) === String(lotId)) {
            const row = data[i];
            
            // Get Lot Number logic
            const aucId = String(row[1] || "");
            let displayLotNum = "";
            if(dbAuc) {
                // Simplified lookup for single item
                const aucRows = dbAuc.getDataRange().getValues();
                for(let a=1; a<aucRows.length; a++) {
                    if(String(aucRows[a][0]) === aucId) {
                        try {
                           const map = JSON.parse(aucRows[a][7] || "{}");
                           displayLotNum = map[lotId] || "";
                        } catch(e){}
                        break;
                    }
                }
            }

            return JSON.stringify({
                lotId: lotId,
                lotNumber: displayLotNum,
                auction: aucId,
                conId: String(row[2]),
                type: String(row[3]),
                year: String(row[4]),
                make: String(row[5]),
                model: String(row[6]),
                vin: String(row[7]),
                mileage: String(row[8]),
                desc: String(row[9]),
                title: String(row[10]),
                payment: String(row[11]),
                reserve: String(row[12]),
                transporter: String(row[13]),
                image: String(row[14]), // FULL IMAGE STRING (HQ)
                notes: String(row[15]),
                status: String(row[16]),
                date: String(row[17]),
                lotType: String(row[19])
            });
        }
    }
    return JSON.stringify({error: "Lot not found"});
}

function getAllConsignors() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const dbCon = ss.getSheetByName(CONFIG.SHEETS.DB_CON);
    if (!dbCon || dbCon.getLastRow() <= 1) return "[]";
    const data = dbCon.getDataRange().getValues();
    data.shift();
    return JSON.stringify(data.map(row => ({ id: row[0], name: row[1], address: row[2], phone: row[3], email: row[4], business: row[6] || "" })));
  } catch (e) { return "[]"; }
}

function getConsignorProfile(conId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const dbCon = ss.getSheetByName(CONFIG.SHEETS.DB_CON);
  const dbInv = ss.getSheetByName(CONFIG.SHEETS.DB_INV);
  const dbRcpt = ss.getSheetByName(CONFIG.SHEETS.DB_RCPT);
  const dbAuc = ss.getSheetByName(CONFIG.SHEETS.DB_AUC);
  
  const conData = dbCon.getDataRange().getValues();
  let profile = null;
  for(let i=1; i<conData.length; i++) {
    if(String(conData[i][0]) === String(conId)) {
      profile = { id: conData[i][0], name: conData[i][1], address: conData[i][2], phone: conData[i][3], email: conData[i][4] || "", notes: conData[i][5] || "[]" };
      break;
    }
  }
  if(!profile) return JSON.stringify({error: "Consignor not found"});

  let aucData = [];
  if(dbAuc && dbAuc.getLastRow() > 1) { aucData = dbAuc.getDataRange().getValues(); }
  const auctionLotMaps = {}; 
  for(let a=1; a<aucData.length; a++) { try { auctionLotMaps[String(aucData[a][0])] = JSON.parse(aucData[a][7] || "{}"); } catch(e) {} }

  const invData = dbInv.getDataRange().getValues(); 
  invData.shift();
  const lots = invData.filter(r => String(r[2]) === String(conId)).map(r => {
    const invId = String(r[0]);
    const aucId = String(r[1]);
    let lotNum = "";
    if (auctionLotMaps[aucId] && auctionLotMaps[aucId][invId]) { lotNum = auctionLotMaps[aucId][invId]; }
    return { lotId: invId, lotNumber: lotNum, desc: r[9], make: r[5], model: r[6], status: r[16], date: r[17], lotType: r[19], year: r[4], vin: r[7] };
  });

  let receipts = [];
  if(dbRcpt && dbRcpt.getLastRow() > 1) {
    const rcptData = dbRcpt.getDataRange().getValues(); 
    rcptData.shift();
    receipts = rcptData.filter(r => String(r[1]) === String(conId)).map(r => ({ id: r[0], date: r[2], url: r[3] }));
  }
  return JSON.stringify({ info: profile, lots: lots, receipts: receipts });
}

function getAllAuctions() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(CONFIG.SHEETS.DB_AUC);
    if (!sheet) { sheet = ss.insertSheet(CONFIG.SHEETS.DB_AUC); sheet.appendRow(["ID", "Name", "DateStart", "DateEnd", "Location", "Description", "Status", "LotMap"]); return "[]"; }
    if (sheet.getLastRow() <= 1) return "[]";
    const data = sheet.getDataRange().getValues();
    data.shift(); 
    return JSON.stringify(data.map(row => ({ id: row[0], name: row[1], dateStart: row[2] ? Utilities.formatDate(new Date(row[2]), Session.getScriptTimeZone(), "yyyy-MM-dd") : "", dateEnd: row[3] ? Utilities.formatDate(new Date(row[3]), Session.getScriptTimeZone(), "yyyy-MM-dd") : "", location: row[4], desc: row[5], status: row[6] })));
  } catch (e) { return "[]"; }
}

function getAuctionProfile(aucId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const dbAuc = ss.getSheetByName(CONFIG.SHEETS.DB_AUC);
  const dbInv = ss.getSheetByName(CONFIG.SHEETS.DB_INV);
  const dbCon = ss.getSheetByName(CONFIG.SHEETS.DB_CON);
  const aucData = dbAuc.getDataRange().getValues();
  let info = null; let lotMap = {};
  for(let i=1; i<aucData.length; i++) {
    if(String(aucData[i][0]) === String(aucId)) {
      info = { id: aucData[i][0], name: aucData[i][1], dateStart: aucData[i][2] ? Utilities.formatDate(new Date(aucData[i][2]), Session.getScriptTimeZone(), "yyyy-MM-dd") : "", dateEnd: aucData[i][3] ? Utilities.formatDate(new Date(aucData[i][3]), Session.getScriptTimeZone(), "yyyy-MM-dd") : "", location: aucData[i][4], desc: aucData[i][5], status: aucData[i][6] };
      try { lotMap = JSON.parse(aucData[i][7] || "{}"); } catch(e){}
      break;
    }
  }
  if(!info) return JSON.stringify({error: "Auction not found"});
  const invData = dbInv.getDataRange().getValues(); invData.shift();
  const lots = invData.filter(r => String(r[1]) === String(aucId)).map(r => { const invId = String(r[0]); const lotNum = lotMap[invId] ? lotMap[invId] : ""; return { lotId: invId, lotNumber: lotNum, conId: r[2], desc: r[9], make: r[5], model: r[6], status: r[16], lotType: r[19], year: r[4], vin: r[7] }; });
  const conIds = [...new Set(lots.map(l => String(l.conId)))]; const conData = dbCon.getDataRange().getValues(); conData.shift();
  const consignors = conData.filter(r => conIds.includes(String(r[0]))).map(r => ({ id: r[0], name: r[1], phone: r[3], email: r[4] }));
  return JSON.stringify({ info: info, lots: lots, consignors: consignors });
}

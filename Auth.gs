/* ==================================================
   AUTHENTICATION & USER MANAGEMENT
   ================================================== */

/**
 * Verifies credentials and returns user profile permissions + preferences.
 */
function loginUser(username, password) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.SHEETS.DB_USERS);
  
  // 1. Initialize Sheet if missing
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEETS.DB_USERS);
    sheet.appendRow(["Username", "Password", "Permissions", "CreatedAt", "Preferences"]);
    sheet.appendRow(["Admin", "Admin", "ALL", new Date(), "{}"]);
  }
  
  // 2. Ensure Default Admin always exists
  const data = sheet.getDataRange().getValues();
  let adminFound = false;
  for(let i=1; i<data.length; i++) {
    if(String(data[i][0]).toLowerCase() === "admin") {
       adminFound = true; 
       break;
    }
  }
  if(!adminFound) {
     sheet.appendRow(["Admin", "Admin", "ALL", new Date(), "{}"]);
  }

  // 3. Verify Credentials
  const users = sheet.getDataRange().getValues(); 
  
  for (let i = 1; i < users.length; i++) {
    if (String(users[i][0]).toLowerCase() === String(username).toLowerCase() && 
        String(users[i][1]) === String(password)) {
      
      const perms = String(users[i][2]);
      
      // Parse Preferences (Col 5 / Index 4)
      let prefs = {};
      try {
        prefs = users[i][4] ? JSON.parse(users[i][4]) : {};
      } catch (e) {
        prefs = {};
      }

      return { 
        success: true, 
        username: users[i][0], 
        permissions: perms === "ALL" ? ["RECEIVING", "LOT_MGMT", "CONSIGNORS", "AUCTIONS", "USERS"] : perms.split(","),
        lastAuction: prefs.lastAuction || "" // Return remembered auction
      };
    }
  }
  
  return { success: false, message: "Invalid Username or Password" };
}

/**
 * Updates the user's preferred auction ID in the DB_Users sheet
 */
function updateUserAuctionPref(username, auctionId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEETS.DB_USERS);
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).toLowerCase() === String(username).toLowerCase()) {
      let prefs = {};
      try { prefs = data[i][4] ? JSON.parse(data[i][4]) : {}; } catch(e) {}
      
      prefs.lastAuction = auctionId;
      
      sheet.getRange(i + 1, 5).setValue(JSON.stringify(prefs));
      return "Saved";
    }
  }
}

/**
 * Creates a new user. 
 */
function createAccount(requestor, newUsername, newPassword, permissionsArray) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEETS.DB_USERS);
  
  const data = sheet.getDataRange().getValues();
  let canCreate = false;
  
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).toLowerCase() === String(requestor).toLowerCase()) {
      const perms = String(data[i][2]);
      if (perms === "ALL" || perms.includes("USERS")) {
        canCreate = true;
      }
      break;
    }
  }
  
  if (!canCreate) throw new Error("Permission Denied: You do not have rights to create users.");

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).toLowerCase() === String(newUsername).toLowerCase()) {
      throw new Error("User '" + newUsername + "' already exists.");
    }
  }

  const permString = permissionsArray.join(",");
  sheet.appendRow([newUsername, newPassword, permString, new Date(), "{}"]);
  
  return "User '" + newUsername + "' created successfully.";
}

function getUserList(requestor) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEETS.DB_USERS);
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  const userList = [];
  for (let i = 1; i < data.length; i++) {
    userList.push({
      username: data[i][0],
      permissions: data[i][2]
    });
  }
  return JSON.stringify(userList);
}

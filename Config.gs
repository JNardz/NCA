const CONFIG = {
  SHEETS: {
    DB_INV: "DB_Inventory",    
    DB_CON: "DB_Consignors",   
    // DB_SERV REMOVED
    DB_RCPT: "DB_Receipts",
    DB_AUC: "DB_Auctions",
    DB_USERS: "DB_Users",
    TEMPLATE: "Template_Receipt",
    TEMPLATE_LABEL: "Template_Label_Inventory" 
  },
  FOLDER_NAME: "Auction_Intake_Images",
  
  RECEIPT: {
    CELL_NUM: "A1", CELL_DATE: "G1", CELL_NAME: "A3", CELL_PHONE: "F3", CELL_ADDR: "A5",
    START_ROW: 8, MAX_ROW: 42,
    COL_DESC: 1, COL_NOTES: 6, COL_RESERVE: 7, COL_TITLE: 8,
    // Signature Cells
    CELL_SIGN_NAME: "A50",
    CELL_SIGN_IMAGE_ROW: 53,
    CELL_SIGN_IMAGE_COL: 1 // Column A
  },

  
LABEL: {
    CELL_HEADER: "B1", 
    CELL_CON: "A4",    
    CELL_INV: "C4",    
    CELL_BARCODE: "C5",
    CELL_ITEM_NAME: "A5",
    CELL_VIN: "C6" 
  },

  LOT_TYPES: {
    "Heavy Machinery": {
      fields: ["year", "make", "model", "vin", "run_condition"], 
      photos: ["Front", "Tag/Serial", "Hour Meter"],
      tasks: [] 
    },
    "Vehicle": {
      fields: ["year", "make", "model", "vin", "color", "run_condition", "title"],
      
photos: ["Front Corner", "VIN Tag", "Odometer"],
      tasks: []
    },
    "Serialized Item": {
      fields: ["desc", "vin"], 
      photos: ["Overall", "Serial Number", "Detail"],
      tasks: []
    },
    "Other": {
      fields: ["desc"], 
      photos: ["Overall", "Detail 1", "Detail 2"],
      tasks: []
    }
  }
};
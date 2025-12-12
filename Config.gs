const CONFIG = {
  SHEETS: {
    DB_INV: "DB_Inventory",    
    DB_CON: "DB_Consignors",   
    DB_RCPT: "DB_Receipts",
    DB_AUC: "DB_Auctions",
    DB_USERS: "DB_Users",
    
    TEMPLATE_RECEIPT: "Merch_Receipt_Template",
    TEMPLATE_IMAGES: "IMAGES_TO_USE", // New Sheet Definition
    
    TEMPLATE_LABEL: "Template_Label_Inventory" 
  },
  
  FOLDER_NAME: "Auction_Intake_Images",
  
  // ... rest of existing config ...
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

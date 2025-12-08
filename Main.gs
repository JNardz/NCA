function doGet() {
  return HtmlService.createTemplateFromFile('index')
      .evaluate()
      .setTitle('North Country Auctions')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

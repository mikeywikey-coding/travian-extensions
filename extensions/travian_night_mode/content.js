"use strict";

// ════════════════════════════════════════════════════════════════
// CONFIGURATION
// ════════════════════════════════════════════════════════════════

const NIGHT_MODE_CONFIG = {
	styleId: "travian-night-mode",
	storageKey: "nightMode",
	defaultEnabled: true,
	buttonColorKey: "purpleButtonColor",
	buttonStyleId: "travian-night-mode-buttons",
	// Sentinel = "leave the game's native buttons untouched". Any hex value
	// instead opts the round buttons into recoloring.
	defaultButtonColor: "default",
	themeAttribute: "data-theme",
	themeValues: {
		dark: "night",
		light: "default",
	},
};

// ════════════════════════════════════════════════════════════════
// THEME DEFINITION
// ════════════════════════════════════════════════════════════════

const THEME = {
	variables: `
:root {
  /* Base colors */
  --nm-white:      #dcdee6;   /* Brightest */
  --nm-gray:       #cccddb;
  --nm-muted:      #b1b1b1;
  --nm-dim:        #6b7080;
  --nm-dead:       #4e505c;
  --nm-soft:       #3d3f46;
  --nm-border:     #3a3f4d;
  --nm-elevated:   #2d3240;
  --nm-orbit:      #3b3c41;
  --nm-hover:      #2a3040;
  --nm-card:       #262a33;
  --nm-stripe:     #232730;
  --nm-overlay:    #202331d4;
  --nm-base:       #1e2028;
  --nm-input:      #1a1d24;
  --nm-black:      #000000;   /* Darkest */

  /* Accent colors */
  --nm-green-txt:  #c0d8a0;
  --nm-green:	     #91bf53;
  --nm-link:       #6fa037;
  --nm-green-hdr:  #313d1e;
  --nm-red:        #e05555;
  --nm-cyan:       #75cbdf;
  --nm-gold:       #ffdda8;

  /* hue rotation */
  --nm-hue-purple:    164deg;

  /* Fallback for the opt-in round-button recolor; the live value is set inline
     from the popup, and at the default setting buttons are left native. */
  --nm-btn-purple:    #71d000;
}
`,

	// ────────────────────────────────────────────────────────────
	// CORE LAYOUT (Low specificity, applies broadly)
	// ────────────────────────────────────────────────────────────
	layout: `
/* Main content container */
#content {
  background-color: var(--nm-base) !important;
  color: var(--nm-white) !important;
}


/* aliance */
#allianceBonusWrapper #contributionBox #bonusSelection label,
.roundedCornersBox h4 {
  filter: hue-rotate(var(--nm-hue-purple)) saturate(2) brightness(0.8) contrast(1.3) !important;
}

.alliance-bonuses-overview h4.round {
  filter: brightness(1.3) hue-rotate(157deg) !important;
}

/* Embassy "General information" / "Leave the alliance" headers keep their
   native light-green bar background, so the lightened body text washes out.
   Force black for readability. */
#build.gid18 #info > h4.roundV2.details,
#build.gid18 #leave > h4.roundV2.details {
  color: var(--nm-black) !important;
}

.iconValueBox {
  background-color: var(--nm-white) !important;
}


/*quest reward cards*/
#tasks .rewardBonus:before, #tasks .task:not(.placeholder):before,
#tasks .task:not(.placeholder).group .titleDecoration {
  filter: grayscale(1);
}

.contentV2 .progressBar .bar .filling.primary.green {
  filter: hue-rotate(var(--nm-hue-purple)) saturate(2) brightness(0.91) contrast(1.3);
}

.contentV2 .progressBar .bar {
  --backgroundColorStart: #bd9608 !important;
  --backgroundColorEnd: #ffffff !important;
}

.pagination {
  filter: hue-rotate(var(--nm-hue-purple)) !important;
}

#tasks .rewardBonus .rewardInfo h4 {
  color: var(--nm-black) !important;
}


.dialogV1.dialogWrapper .manual.dialog #dialogContent .troopDataWrapper,
.dialogV1.dialogWrapper .manual.dialog #dialogContent .troopInfoWrapper {
  background-color: var(--nm-base) !important;
}

#center #contentOuterContainer.contentPage h1.titleInHeader {
  color: #e4e5e7 !important;
      text-shadow: calc(var(--scaleXFactor) * 1px) 0 0 #45453a, 
      calc(var(--scaleXFactor) * 1px) 1px 0 #3d3530, 0 1px 0 #47321c, 
      calc(var(--scaleXFactor) * -1px) 1px 0 #f5f5f500, 
      calc(var(--scaleXFactor) * -1px) 0 0 #58473e00, 
      calc(var(--scaleXFactor) * -1px) -1px 0 #5e463a00, 0 -1px 0 #574a4300, 
      calc(var(--scaleXFactor) * 1px) -1px 0 #52474200;
}

div#build div.bigUnitSection .unitZoom:focus {
  background-color: var(--nm-base) !important;
}

div#build div.bigUnitSection .unitZoom:hover {
  background-color: var(--nm-card) !important;
}


/* Content wrappers */
#center #contentOuterContainer .contentContainer {
  background-color: var(--nm-base) !important;
}

.dialogV2.dialogWrapper .oneTimeOfferAnnouncement .dialogContents .subtitle,
.dialogV2.dialogWrapper .oneTimeOfferAnnouncement .dialogContents .title {
  color: var(--nm-white) !important;
}

.contentNavi.subNavi .scrollingContainer .content a {
    background-color: var(--nm-base) !important;
    background-image: none !important;
    color: var(--nm-gold) !important;
    width: 100% !important;
    height: 42px !important;
    line-height: 42px !important;
    display: inline-block !important;
    text-align: center !important;
    padding: 0 10px !important;
    box-sizing: border-box !important;
    box-shadow: 0 -10px 2px -5px rgba(0, 0, 0, .45) inset, 0 20px 10px -5px rgba(0, 0, 0, .2) inset !important;
    border-top: solid 1px #2d1408 !important;
    border-bottom: solid 1px #d7b672 !important;
    border-left: none !important;
    border-right: none !important;
    text-shadow: none !important;
    white-space: nowrap !important;
    text-overflow: ellipsis !important;
    overflow: hidden !important;
    transition-duration: 150ms !important;
}

#contentOuterContainer .village2 .buildingList {
    top: -59px;
    left: 419px;
}

table td, table th {
  background-color: var(--nm-base);
}

table thead td {
  color: var(--nm-white) !important;
}

div.productionBoostSpeechBubble td {
  color: var(--nm-white) !important;
}

.fluidSpeechBubble .fluidSpeechBubble-bl, .fluidSpeechBubble .fluidSpeechBubble-br, .fluidSpeechBubble .fluidSpeechBubble-tl, .fluidSpeechBubble .fluidSpeechBubble-tr {
  filter: opacity(0);
}

div.productionBoostSpeechBubble .speechArrowBack {
  filter: opacity(0);
}

#contentOuterContainer.contentPage {
  background-color: transparent !important;
}

#auctions > div:nth-child(4) > div.bidListWrapper * {
  color: var(--nm-white) !important;
}

#auctions > div:nth-child(5) > div.soldListWrapper * {
  color: var(--nm-white) !important;
}

#auctions > div.auctionListWrapper > table * {
  color: var(--nm-white) !important;
}

#content > table > tbody > tr,
#content > table > tbody > tr.hover:hover > td,
#player > tbody > tr.hover:hover > td,
#overview > tbody > tr.hover:hover > td,
tr.hover:hover td{
  background-color: var(--nm-base) !important;
}

#content > table > thead > tr > td {
  color: var(--nm-white) !important;
}

#content > table > tbody > tr > td {
  color: var(--nm-white) !important;
}

#villages > tbody > tr.hl > td {
  background-color: var(--nm-elevated) !important;
}

#heroes > tbody > tr.hl > td {
  background-color: var(--nm-elevated) !important;
}

/* Paper backgrounds */
.paperTop,
.paperBottom {
  background-image: none !important;
  background-color: var(--nm-base) !important;
  color: var(--nm-white) !important;
}

.contentNavi.subNavi .scrollingContainer .content {
  color: var(--nm-gold) !important;
}

#content > div.paper > div > div.paperTop > div > div.separator {
  background-color: var(--nm-base) !important;
  color: var(--nm-white) !important;
}
`,

	// ────────────────────────────────────────────────────────────
	// SIDEBAR & TOP BAR
	// ────────────────────────────────────────────────────────────
	sidebar: `
/* Sidebars */
.sidebar .sidebarBox .content:before,
.sidebar #sidebarBoxVillageList .content .groupWrapper {
  filter: saturate(0.17) brightness(0.95);
}

.sidebar .sidebarBox.toggleable .toggle button svg.toggleArrow .caret {
  stroke: var(--nm-white) !important;
}

.sidebar .sidebarBox.toggleable .toggle button:before {
  background-color: #7e31e4;
  border: 2px solid transparent;
  border-color: #ecc7508a #ffffff96 #ecc7509a;
}

/* Village groups */
.sidebar #sidebarBoxVillageList .content .villageList .listEntry.group {
  filter: saturate(2.03);
}

/* Color picker popup overflows its entry, but the per-entry filter above makes
   every entry its own stacking context — so later sibling entries paint over
   the palette and swallow its clicks. Lift the entry being edited above them. */
.sidebar #sidebarBoxVillageList .content .villageList .listEntry.group:has(.availableColors) {
  position: relative;
  z-index: 30;
}

#villageName > form > svg {
  filter: saturate(0.17) brightness(0.95);
}


/* Top bar hero */
#topBarHeroWrapper #topBarHero .heroImageButton:after {
  filter: grayscale(0.7) brightness(1.2);
}

#topBarHeroWrapper #topBarHero:after {
  filter: grayscale(0.8) brightness(1.1);
}


/* Top bar */
#servertime, body div#background:before,
#topBar #header.referAFriend:before,
#header #navigation>a:before, #header #navigation>label:before,
#header #navigation>a:hover:before, #header #navigation>label:hover:before,
#header .currency:before {
  filter: grayscale(1) brightness(0.86);
}

#stockBar .warehouse .stockBarButton,
#stockBar .granary .stockBarButton {
  background-color: var(--nm-dead) !important;
  color: #f7f7f7 !important;
  border-top-color: var(--nm-white) !important;
}

#stockBar .warehouse:before,
#stockBar .granary:before {
  background-color: var(--nm-orbit) !important;
}

#stockBar .granary .capacity i, #stockBar .warehouse .capacity i {
  filter: grayscale(0.65) brightness(1.2);
}

#header #navigation > a,
#header #navigation > label,
#header #navigation > a:hover,
#header #navigation > label:hover {
  background-image: linear-gradient(to bottom, #fffdfa, #372714);
}

#header #navigation > a:hover:after, #header #navigation > label:hover {
  filter: hue-rotate(4deg) brightness(1.1) saturate(1.12);
}

#header #navigation > a:after, #header #navigation > label {
  filter: brightness(1.1) saturate(0.25);
}
`,

	// ────────────────────────────────────────────────────────────
	// NAVIGATION
	// ────────────────────────────────────────────────────────────
	navigation: `
/* Tab bar container */
.contentNavi.subNavi {
  background-color: var(--nm-input) !important;
  border-color: var(--nm-border) !important;
}


/* Tab states */
.tabItem.active {
  background-color: var(--nm-overlay) !important;
  color: var(--nm-gold) !important;
}

.tabItem.normal {
  background-color: var(--nm-base) !important;
  color: var(--nm-gold) !important;
}


#tasks > div > div.taskOverview > div.rewardBonus > div.rewardInfo > h4 {
  color: var(--nm-orbit) !important;
}


/* Styled tabs (hero menu, tasks — all use same look) */
#heroV2 > div:nth-child(2) > div.contentNavi.subNavi.tabFavorWrapper > div > div > a,
#tasks > div > div:nth-child(2) > div.contentNavi.subNavi.tabFavorWrapper > div > div > a {
  background-color: var(--nm-base) !important;
  background-image: none !important;
  color: var(--nm-gold) !important;
  width: 100% !important;
  height: 42px !important;
  line-height: 42px !important;
  display: inline-block !important;
  text-align: center !important;
  padding: 0 10px !important;
  box-sizing: border-box !important;
  box-shadow: 0 -10px 2px -5px rgba(0,0,0,.45) inset, 0 20px 10px -5px rgba(0,0,0,.2) inset !important;
  border-top: solid 1px #2d1408 !important;
  border-bottom: solid 1px #d7b672 !important;
  border-left: none !important;
  border-right: none !important;
  text-shadow: none !important;
  white-space: nowrap !important;
  text-overflow: ellipsis !important;
  overflow: hidden !important;
  transition-duration: 150ms !important;
}

#heroV2 > div:nth-child(2) > div.contentNavi.subNavi.tabFavorWrapper > div > div > a:hover,
#tasks > div > div:nth-child(2) > div.contentNavi.subNavi.tabFavorWrapper > div > div > a:hover {
  background-color: var(--nm-hover) !important;
  background-image: none !important;
}

#content.buildMarketBuy .merchantsInformation:not(.placeholder), #content.buildMarketOffer .merchantsInformation:not(.placeholder), #content.buildMarketSendResources .merchantsInformation:not(.placeholder), #content.buildRallyPointFarmList .noticeBox, #content.heroAdventure .videoFeatureBonusBox, #content.heroAdventure .walkingCalculationWrapper, .dialogWrapper #videoFeature.infoScreen .videoFeatureBonusBox {
  background-color: var(--nm-base) !important;
}

#heroAdventure > table > tbody > tr > td {
  background-color: var(--nm-base) !important;
  color: var(--nm-white) !important;
}

#content.heroAdventure .adventureList th {
  color: var(--nm-white) !important;
}

#content.buildMarketSendResources .groupHeader {
  border: none !important;
}

.contentV2 h4 {
  color: var(--nm-white) !important;
}

/* 1. Make the main backdrop pink */
.dialogContainer,
.dialogContainer .dialogContents,
.dialogContainer .content,
.dialogContainer .featureCollection,
.dialogContainer .featureContent,
.dialogContainer .activation,
.dialogContainer .dialogDragBar {
    background-color: var(--nm-base) !important;
    background-image: none !important;
}

/* 2. PROTECT THE ICONS: This part is crucial for the images to show */
/* We target the featureImage classes and any element with 'icon' in it */
.dialogContainer .featureImage,
.dialogContainer [class*="Image"],
.dialogContainer [class*="Icon"],
.dialogContainer i {
    background-color: transparent !important;
}

`,

	// ────────────────────────────────────────────────────────────
	// TABLES
	// ────────────────────────────────────────────────────────────
	tables: `
/* resources tabs */
#content > div.contentNavi.tabNavi > div.container.active > div.content.favor {
  background-color: var(--nm-elevated) !important;
  color: var(--nm-white) !important;
}

#search_navi > div.searchWrapper {
  background-color: var(--nm-elevated) !important;
}

#player > tbody {
  background-color: var(--nm-base) !important;
}

#player > tbody > tr.hl > td {
  background-color: var(--nm-elevated) !important;
}

#player > thead > tr > td {
  color: var(--nm-white) !important;
}

#player > tbody > tr > td {
  color: var(--nm-white) !important;
}

#troopSendForm > table > tbody > tr > th,
#troopSendForm > table > tbody > tr > td {
  background-color: var(--nm-base) !important;
}


/*overview tab*/
#overview > thead > tr > td {
  color: var(--nm-white) !important;
  background-color: var(--nm-elevated) !important;
}

#overview > tbody > tr > td.vil.fc,
#overview > tbody > tr > td.att,
#overview > tbody > tr > td.bui,
#overview > tbody > tr > td.tro,
#overview > tbody > tr > td.tra.lc {
  background-color: var(--nm-elevated) !important;
}


/* Overview table */
#overview > tbody,
#overview > tbody * {
  color: var(--nm-link) !important;
}


/*resources tab*/
/* Statistics tables — header + alternating rows + elevated sum row.
   Scoped to body.village3 so #production/#troops on dorf1 (village1) aren't affected. */
body.village3 #ressources > thead > tr > td,
body.village3 #warehouse > thead > tr > td,
body.village3 #production > thead > tr > td,
body.village3 #capacity > thead > tr > td,
:is(body.village3, body.reports) #overview > thead > tr > td,
body.village3 #culture_points > thead > tr > td,
body.village3 #troops > thead > tr > td,
#overview.row_table_data > thead > tr > th {
  background-color: var(--nm-elevated) !important;
  color: var(--nm-white) !important;
}

body.village3 #ressources > tbody > tr > td,
body.village3 #warehouse > tbody > tr > td,
body.village3 #production > tbody > tr > td,
body.village3 #capacity > tbody > tr > td,
:is(body.village3, body.reports) #overview > tbody > tr > td,
body.village3 #culture_points > tbody > tr > td,
body.village3 #troops > tbody > tr > td {
  color: var(--nm-white) !important;
}

body.village3 #ressources > tbody > tr:nth-child(odd):not(.sum) > td,
body.village3 #warehouse > tbody > tr:nth-child(odd):not(.sum) > td,
body.village3 #production > tbody > tr:nth-child(odd):not(.sum) > td,
body.village3 #capacity > tbody > tr:nth-child(odd):not(.sum) > td,
:is(body.village3, body.reports) #overview > tbody > tr:nth-child(odd):not(.sum) > td,
body.village3 #culture_points > tbody > tr:nth-child(odd):not(.sum) > td,
body.village3 #troops > tbody > tr:nth-child(odd):not(.sum) > td {
  background-color: var(--nm-base) !important;
}

body.village3 #ressources > tbody > tr:nth-child(even):not(.sum) > td,
body.village3 #warehouse > tbody > tr:nth-child(even):not(.sum) > td,
body.village3 #production > tbody > tr:nth-child(even):not(.sum) > td,
body.village3 #capacity > tbody > tr:nth-child(even):not(.sum) > td,
:is(body.village3, body.reports) #overview > tbody > tr:nth-child(even):not(.sum) > td,
body.village3 #culture_points > tbody > tr:nth-child(even):not(.sum) > td,
body.village3 #troops > tbody > tr:nth-child(even):not(.sum) > td,
body.village3 #ressources > tbody > tr.sum > td,
body.village3 #warehouse > tbody > tr.sum > td,
body.village3 #production > tbody > tr.sum > td,
body.village3 #capacity > tbody > tr.sum > td,
:is(body.village3, body.reports) #overview > tbody > tr.sum > td,
body.village3 #culture_points > tbody > tr.sum > td,
body.village3 #troops > tbody > tr.sum > td {
  background-color: var(--nm-elevated) !important;
}

body.village3 #ressources a,
body.village3 #warehouse a,
body.village3 #production a,
body.village3 #capacity a,
/* Alliance reports filter buttons + report tables (table itself is silver, shows through cell gaps) */
.allianceReportFilterButton,
.allianceReportOwnFilterButton {
  background-color: var(--nm-base) !important;
}
body.alliance #offs,
body.alliance #defs {
  background-color: var(--nm-base) !important;
}
.reportFilter.offDef,
.reportFilter.unimportant {
  background-color: var(--nm-elevated) !important;
}

:is(body.village3, body.reports) #overview a,
body.village3 #culture_points a,
body.village3 #troops a,
#content.village3Troops table a {
  color: var(--nm-link) !important;
}

/* Troop statistics subtabs (support/smithy/hospital/training) — same pattern,
   tables here have no id, so scope by the page's #content class */
#content.village3Troops table > thead > tr > td,
#content.village3Troops table > thead > tr > th {
  background-color: var(--nm-elevated) !important;
  color: var(--nm-white) !important;
}
#content.village3Troops table > tbody > tr > td,
#content.village3Troops table > tbody > tr > th,
#content.village3Troops table > tbody > tr > td *,
#content.village3Troops table > tbody > tr > th *,
#content.village3Troops table > thead > tr > td *,
#content.village3Troops table > thead > tr > th * {
  color: var(--nm-white) !important;
}
#content.village3Troops table > tbody > tr:nth-child(odd):not(.sum) > td {
  background-color: var(--nm-base) !important;
}
#content.village3Troops table > tbody > tr:nth-child(even):not(.sum) > td,
#content.village3Troops table > tbody > tr.sum > td {
  background-color: var(--nm-elevated) !important;
}


/* village name */
#ressources a {
  color: var(--nm-link) !important;
}


/* village resource count */
#ressources > tbody > tr > td.vil.fc > span {
  color: var(--nm-white) !important;
}
#ressources > tbody > tr > td.tra.lc > a {
  color: var(--nm-white) !important;
}
#ressources > tbody > tr.sum > td.vil > span {
  color: var(--nm-white) !important;
}

div.village3 table#overview td.vil.fc {
  color : var(--nm-link) !important;
}

#overview > tbody > tr:nth-child(4) > td.vil.fc > span {
  color: var(--nm-base) !important;
}

#overview > tbody > tr > td.sub > div > a {
  color: var(--nm-link) !important;
}

/* Mark all checkbox */
#markAll > span > label {
  color: var(--nm-white) !important;
}
`,

	// ────────────────────────────────────────────────────────────
	// FORMS & INPUTS
	// ────────────────────────────────────────────────────────────
	forms: `
/* Form inputs (scoped to #content to avoid extension conflicts) */
#content input[type=date],
#content input[type=datetime-local],
#content input[type=datetime],
#content input[type=email],
#content input[type=month],
#content input[type=number],
#content input[type=password],
#content input[type=search],
#content input[type=tel],
#content input[type=text],
#content input[type=time],
#content input[type=url],
#content input[type=week],
#content select,
#content textarea {
  background-color: var(--nm-elevated) !important;
  color: var(--nm-white) !important;
  border-color: var(--nm-dim) !important;
}

/* Native <select> dropdown options (e.g. catapult target picker in #troopSendForm) */
#content select option,
#content select optgroup {
  background-color: var(--nm-elevated) !important;
  color: var(--nm-white) !important;
}


/* Troop count links (clickable numbers) — green */
#content table#troops a {
  color: var(--nm-green) !important;
}


/* Form switches */
.formV2 .switch {
  background-color: var(--nm-base) !important;
  color: var(--nm-white) !important;
  border-color: var(--nm-border) !important;
}


/* Map filter */
.mapFilter {
  background-color: var(--nm-card) !important;
  color: var(--nm-white) !important;
}
`,

	// ────────────────────────────────────────────────────────────
	// DIALOGS & MODALS
	// ────────────────────────────────────────────────────────────
	dialogs: `
/* Dialog container */
.dialogContainer {
  background-color: var(--nm-base) !important;
  color: var(--nm-white) !important;
}

#playerProfile > div > table > thead > tr * {
  color: var(--nm-white) !important;
}

#playerProfile > div > table > tbody * {
  background-color: var(--nm-base) !important;
}

#build > div > div.filterWrapper > div {
  background-color: var(--nm-base) !important;
}

#playerProfile > div > table > tbody > tr > td.inhabitants {
  color: var(--nm-white) !important;
}

abort > button {
  filter: grayscale(1) brightness(0.7) !important;
}

#playerProfile > div > table > tbody > tr > td.name > span {
  color: var(--nm-dim) !important;
}

div.linklist div.recommendedLinks {
  background-color: var(--nm-card) !important;
}

.dialogContainer .dialogContents {
  background-color: var(--nm-card) !important;
  color: var(--nm-white) !important;
}

body > div.dialogOverlay.enabled.dialogVisible > div > div > div > div {
  background-color: var(--nm-base) !important;
  color: var(--nm-white) !important;
}


/* Dialog content */
#dialogContent > h3,
#dialogContent > div > h3 {
  color: var(--nm-white) !important;
}

#dialogContent > div > div.resourceRowBody > div.resourceInput.formV2 > label > div {
  background-color: var(--nm-elevated) !important;
  color: var(--nm-white) !important;
}


/* Dialog tables */
.dialogContainer table {
  color: var(--nm-white) !important;
  border-color: var(--nm-dim) !important;
}

.dialogContainer table td,
.dialogContainer table th {
  background-color: var(--nm-base) !important;
  color: var(--nm-white) !important;
  border-color: var(--nm-dim) !important;
}

.dialogContainer input {
  background-color: var(--nm-base) !important;
  color: var(--nm-white) !important;
  border-color: var(--nm-dim) !important;
}

#paymentWizardContent * {
  color: var(--nm-base) !important;
}

.dialog.paymentShopV4 #paymentWizard.prosV2 .contentWrapper * {
  color: var(--nm-base) !important;
}

/* paymentShopV5 Buy Gold tab: the package selection (.shopWrapper) renders on the
   dark dialog background, so the nm-base (dark) text above is unreadable — force it
   white. Scoped to .shopWrapper so the Advantages tab (.advantagesBonusBox, light
   parchment cards) keeps its dark text. Tabs live outside #paymentWizardContent. */
.dialog.paymentShopV5 #paymentWizardContent .shopWrapper * {
  color: var(--nm-white) !important;
}

#paymentWizardContent > div.purchaseStepWrapper > div:nth-child(1) > label:nth-child(8) > div.best.bestSeller > div,
#paymentWizardContent > div.purchaseStepWrapper > div:nth-child(1) > label:nth-child(12) > div.best.bestValue > div {
  color: var(--nm-gold) !important;
}

.dialogContainer #paymentWizard .tabItem {
  background-color: var(--nm-base) !important;
  background-image: none !important;
  color: var(--nm-gold) !important;
  box-shadow: 0 -10px 2px -5px rgba(0,0,0,.45) inset, 0 20px 10px -5px rgba(0,0,0,.2) inset !important;
  border-top: solid 1px #2d1408 !important;
  border-bottom: solid 1px #d7b672 !important;
  border-left: none !important;
  border-right: none !important;
  text-shadow: none !important;
  transition-duration: 150ms !important;
}
.dialogContainer #paymentWizard .tabItem.active {
  background-color: var(--nm-base) !important;
  background-image: none !important;
  color: var(--nm-gold) !important;
}
.dialogContainer #paymentWizard .content.active::after {
  display: none !important;
}
.dialog.paymentShopV4 .contentNavi .content.active a:before,
.dialog.paymentShopV0 .contentNavi .content.active a:before {
  background-image: linear-gradient(rgba(255, 255, 255, 0) 3px, rgba(255, 255, 255, .45) 4px, rgba(255, 255, 255, 0) 7px, rgba(255, 255, 255, 0) 27px, #9d6960 50px) !important;
}
.dialogContainer #paymentWizard .tabItem:hover,
.dialogContainer #paymentWizard .content.active .tabItem:hover {
  background-color: var(--nm-hover) !important;
}


/* NPC dialog */
#npc {
  margin-bottom: 8px !important;
  border-color: var(--nm-dim) !important;
}

#npc table {
  background-color: var(--nm-elevated) !important;
  border-color: var(--nm-dim) !important;
}

#npc table td,
#npc table th {
  background-color: var(--nm-card) !important;
  color: var(--nm-white) !important;
  border-color: var(--nm-dim) !important;
}


/* Header and Footer cells */
thead.includedHeader th,
tfoot td,
tfoot th {
  position: relative;
  isolation: isolate;
}
/* When Travian injects a sort/options menu into a header cell, lift the
   cell's own stacking context above siblings (e.g. .expandCollapse) so the
   menu is visible. Isolation stays on, so the cell's ::before backdrop
   continues to mask the beige thead background underneath. */
thead.includedHeader th:has(.contextMenuWrapper),
tfoot td:has(.contextMenuWrapper),
tfoot th:has(.contextMenuWrapper) {
  z-index: 9999;
}

thead.includedHeader th::before,
tfoot td::before,
tfoot th::before {
  content: "";
  position: absolute;
  inset: 0;
  background-color: var(--nm-base);
  z-index: -1;
  pointer-events: none;
}

/* Color all text and icons in header/footer to white */
table.slots.borderGap thead.includedHeader th,
table.slots.borderGap thead.includedHeader th *,
table.slots.borderGap tfoot td,
table.slots.borderGap tfoot td *,
table.slots.borderGap tfoot th,
table.slots.borderGap tfoot th * {
  color: var(--nm-white) !important;
  fill: var(--nm-white) !important;
  stroke: var(--nm-white) !important;
}

.buttonSecondary.toggle.brown.active {
  background-color: var(--nm-elevated) !important;
}


div#build table.under_progress tr.next td {
  background-color: var(--nm-base) !important;
}

#auctions > div.itemTypeDetailContainer > div.itemTypeDetailedInformation > div.priceTable > table > tbody * {
  background-color: var(--nm-base) !important;
  color: var(--nm-white) !important;
}

#auctions > div.itemTypeDetailContainer > div.auctionListWrapper * {
  color: var(--nm-white) !important;
}

tr.slot * {
  color: var(--nm-white) !important;
}

#rallyPointFarmList > div.villageWrapper > div.dropContainer > div > div.farmListHeader > div.dragAndDrop.preventMobileSwipeNavigation {
  stroke: var(--nm-dim) !important; 
}

#rallyPointFarmList > div.villageWrapper > div.dropContainer > div > div.slotsWrapper.formV2 > table > tbody > tr > td {
  color: var(--nm-white) !important;
}

#rallyPointFarmList > div.villageWrapper > div.dropContainer > div > div.slotsWrapper.formV2 > table > tbody > tr {
  background-color: var(--nm-base) !important;
}

openContextMenu * {
  background-color: transparent !important;
}

farmListWrapper.expanded * {
  background-color: var(--nm-base) !important;
}

targetSelection * {
  color : var(--nm-white) !important; 
}

table#croplist > thead * {
  color : var(--nm-white) !important; 
}

table.troop_details.settle * {
  background-color: var(--nm-base) !important;
}

#npc * {
  background-color: var(--nm-base) !important;
  border-color: var(--nm-dim) !important;
}

div.a2b .destination {
  background-color: var(--nm-card) !important;
}

div.a2b table#short_info {
  background-color: var(--nm-base) !important;
}
`,

	// ────────────────────────────────────────────────────────────
	// BUTTONS
	// ────────────────────────────────────────────────────────────
	buttons: `
/* Green rectangular buttons */
.buttonFramed.rectangle.gold:before {
  filter: hue-rotate(198deg) saturate(2) !important;
}
/* Purple rectangular buttons */
.buttonFramed.rectangle.purple:before {
  filter: hue-rotate(338deg) saturate(2) !important;
}

/* Green rectangular buttons */
.buttonFramed.rectangle.green:before {
  filter: hue-rotate(201deg) saturate(1.3) brightness(1.16) !important;
}

/* Round green buttons are recolored separately and opt-in — see
   ROUND_BUTTON_RECOLOR_CSS / applyButtonColor() lower in this file. At the
   default setting nothing here touches them, so the game's native buttons
   show through unchanged. */

/*green menu buttons*/
button.textButtonV1.green {
  color: #dde6ed;
  background-image: linear-gradient(to bottom, #689baf, #541375);
  background-color: #8ca16b;
  border: 0px solid #283308;
  box-shadow: inset 2px 0 1px -1px #ffffffad, inset -2px 0 1px -1px #40d7bb, inset 0 3px 1px -1px #ffffff, inset 0 -3px 1px -1px rgb(95 225 195 / 47%) !important;
}
button.textButtonV1.green:hover {
  color: #dde6ed;
  filter: brightness(1.2) !important;
  background-image: linear-gradient(to bottom, #689baf, #541375);
  background-color: #8ca16b;
  border: 0px solid #283308;
  box-shadow: inset 2px 0 1px -1px #ffffffad, inset -2px 0 1px -1px #40d7bb, inset 0 3px 1px -1px #ffffff, inset 0 -3px 1px -1px rgb(95 225 195 / 47%) !important;
}
/*green menu buttons(ads)*/
button.textButtonV1.purple {
  color: #f2f2f2;  
  filter: brightness(1.2) !important;
  background-image: linear-gradient(to bottom, #6d77ee, #8514c7);
  background-color: #ad73c5;
  border: 0px solid #200532;
  box-shadow: inset 2px 0 1px -1px #bc82d5, inset -3px 0 1px -1px #87569b, inset 0 3px 1px -1px #d68ef6, inset 0 -3px 1px -1px rgba(66, 29, 83, .6);
}
button.textButtonV1.purple:hover {
  color: #f2f2f2;
  background-image: linear-gradient(to bottom, #6d77ee, #8514c7);
  background-color: #ad73c5;
  border: 0px solid #200532;
  box-shadow: inset 2px 0 1px -1px #bc82d5, inset -3px 0 1px -1px #87569b, inset 0 3px 1px -1px #d68ef6, inset 0 -3px 1px -1px rgba(66, 29, 83, .6);
}
/* Button text colors */
.buttonFramed.rectangle.withText.grey > div {
  color: #393939 !important;
}

.textButtonV2.buttonSecondary.rectangle.withIcon.toggle.brown,
.buttonSecondary.toggle.brown.active {
  --fontColor: var(--nm-white);
  color: var(--nm-white) !important;
}

.buttonFramed svg .icon {
  filter: grayscale(1) brightness(1.1) contrast(0.94);
}

#auctions button.textButtonV2.brown {
  color: var(--nm-white) !important;
}

/* Sticky wrapper (simulate button area) */
#stickyWrapper {
  background-color: var(--nm-base) !important;
  background-image: none !important;
  border-top: none !important;
  border-bottom: none !important;
}
`,

	// ────────────────────────────────────────────────────────────
	// GAME PAGES
	// ────────────────────────────────────────────────────────────
	gamePages: `
/* === VILLAGE (DORF1/DORF2) === */
.villageInfobox,
.buildingList {
  background-color: var(--nm-overlay) !important;
}

div.village1 .villageInfoWrapper .villageInfobox table thead th {
  color: var(--nm-white) !important;
}

#contentOuterContainer > div > div.villageInfoWrapper {
  color: var(--nm-white) !important;
}

#movements > tbody > tr:nth-child(2) > td:nth-child(2) > div.dur_r {
  color: var(--nm-muted) !important;
}

#movements span.adventure {
  color: var(--nm-cyan) !important;
}

.buildingList > ul > li > div.buildDuration {
  color: var(--nm-muted) !important;
}

.buildingList ul li {
  color: var(--nm-white) !important;
}

.buildingList > h5 {
  color: var(--nm-white) !important;
}


/* === BUILDING PAGES === */
#build {
  color: var(--nm-white) !important;
}

#build > div > p > a {
  color: var(--nm-white) !important;
}

#build > div > h4 {
  color: var(--nm-white) !important;
}

[id^="contract_building"] > div.build_desc > h2 {
  color: var(--nm-white) !important;
}

#build div.action {
  background-color: var(--nm-base) !important;
  color: var(--nm-white) !important;
}

#build div.action .innerTroopWrapper {
  background-color: var(--nm-base) !important;
  color: var(--nm-white) !important;
}

#nonFavouriteTroops > div.action.troop > div > div.details > div.cta > input {
  background-color: var(--nm-base) !important;
  color: var(--nm-white) !important;
}

.upgradeBuilding {
  background-color: var(--nm-stripe) !important;
}

#build .upgradeBuilding.completed .completedMessage span {
  color: var(--nm-white) !important;
}

div.messages table#overview th.dat a {
  color: var(--nm-white) !important;
}

h4.round,
div.round {
  background-color: var(--nm-green-hdr) !important;
  color: var(--nm-white) !important;
}

.buildingWrapper {
  border-bottom-color: var(--nm-border) !important;
}

#expansionTab > h4:nth-child(1), #expansionTab > h4:nth-child(3) {
  color: var(--nm-base) !important;
}

#contract > div.inlineIconList.resourceWrapper {
  color: var(--nm-white) !important;
}

#build > div.buildingDescription > div.description {
  color: var(--nm-white) !important;
}

#build > div.upgradeBuilding > div.upgradeButtonsContainer.section2Enabled > div.section1 > div,
#build > div.upgradeBuilding > div.upgradeButtonsContainer.section2Enabled > div.section1 > span,
#build > div.upgradeBuilding > div.upgradeButtonsContainer.section2Enabled > div.section2 > div,
#build > div.upgradeBuilding > div.upgradeButtonsContainer.section2Enabled > div.section2 > span {
  color: var(--nm-white) !important;
}

#contract > div.upgradeBlocked > div {
  color: var(--nm-muted) !important;
}

#contract > div.upgradeBlocked > div > span._w-nm {
  color: var(--nm-muted) !important;
}

button.textButtonV1.gold.disabled, button.textButtonV1.gold:disabled { color: var(--nm-base) !important; }

#build_value th,
#build_value td {
  background: transparent !important;
}


/* === RALLY POINT === */
#rallyPoint {
  color: var(--nm-white) !important;
}

.subTabs .subTabs_tabs {
  border-bottom: solid 1px var(--nm-base) !important;
}

.subTabs .subTabs_tabs:after, .subTabs .subTabs_tabs:before {
  background-image: none;
}

#resourceSelection > div,
#rallyPointSimulators .subTabs {
  background-color: var(--nm-base) !important;
  color: var(--nm-white) !important;
}

/* Waterworks "Bonus level" node (Annexed oasis flow diagram) keeps its
   native near-white background while night mode lightens the text, leaving
   a glaring white box. Match it to the dark surface. */
.bonusLevelInformation,
.bonusLevelInformation .levelAbove {
  background-color: var(--nm-base) !important;
}

#tradeRoutes > div.tradeRouteCollection > div > div {
  color: var(--nm-base) !important;
}

div.a2b table#troops td {
  background-color: var(--nm-base) !important;
}

#movements > tbody > tr > td > div {
  color: var(--nm-muted) !important;
}

#bonusBox0, #bonusBox1, #bonusBox2, #bonusBox3 {
  background-color: var(--nm-base) !important;
  color: var(--nm-white) !important;
}

#contributionBox {
  background-color: var(--nm-base) !important;
}

/* Alliance bonus section headers: light green-to-white gradient natively */
#contributionBox,
#allianceBonusOverview .bonusBox {
  border-color: var(--nm-border) !important;
}

#allianceBonusOverview .bonusBox > h4 {
  background: linear-gradient(to right, var(--nm-green-hdr), var(--nm-card)) !important;
  color: var(--nm-gray) !important;
}

#contributionBox > h4 {
  background: linear-gradient(to right, var(--nm-green-hdr), var(--nm-card)) !important;
  color: var(--nm-white) !important;
}

#allianceBonusOverview .bonusBox > h4 strong {
  color: var(--nm-white) !important;
}

/* Alliance bonus bars. Every level marker in the game's sprite sits on an
   opaque white box, so the markers are redrawn as rings on the dark track:
   hollow until reached, then filled with the bar's own state color. */
#allianceBonusOverview .progressBar .front {
  border-color: var(--nm-border) !important;
}

#allianceBonusOverview .progressBar .front .back {
  border-color: transparent !important;
}

#allianceBonusOverview .progressBar.inactive .back {
  background-color: var(--nm-dim) !important;
}

#allianceBonusOverview .progressBar .levels > div:not(.upgrading) {
  --nm-level-fill: var(--nm-base);
  background: radial-gradient(circle 8px at 50% 50%,
    var(--nm-level-fill) 5px, var(--nm-base) 5.5px 6px,
    var(--nm-dim) 6.5px 7.25px, transparent 8px) !important;
}

#allianceBonusOverview .progressBar .levels > div.reached {
  --nm-level-fill: #99c01a;
}

#allianceBonusOverview .progressBar.complete .levels > div {
  --nm-level-fill: #237590;
}

#allianceBonusOverview .progressBar.inactive .levels > div.reached,
#allianceBonusOverview .progressBar.inactive.complete .levels > div {
  --nm-level-fill: var(--nm-dim);
}

/* The animated "upgrading" gear keeps its GIF: inverting turns the white box
   black, and lighten lets the track show through it. */
#allianceBonusOverview .progressBar .levels > div.upgrading {
  filter: invert(1) hue-rotate(180deg) brightness(1.6);
  mix-blend-mode: lighten;
}

/* Own row in the alliance bonus top-5 contributor tables */
table.top5 > tbody > tr.hl > td {
  background-color: var(--nm-elevated) !important;
}

#tradeRouteEditCreate > div.targetSelector > div:nth-child(1) > label > div.label.pinned {
  background-color: var(--nm-card) !important;
  color: var(--nm-white) !important;
}

#bonusSelection > label {
  color: var(--nm-base) !important;
}

div.a2b table#troops {
  background-color: var(--nm-base) !important;
}

div#build.gid16 table.troop_details thead a {
  color: var(--nm-white) !important;
}

#build > div > form > div.destination > table:nth-child(2) > tbody > tr > td,
#build > div > form > div.destination > table:nth-child(1) > tbody > tr > td:nth-child(1),
#build > div > form > div.destination > table:nth-child(1) > tbody > tr > td.compactInput {
  background-color: var(--nm-card) !important;
}

/* Build-form info row — Travian paints it white; match the dark theme */
#build > div > form > table > tbody.infos,
#build > div > form > table > tbody.infos > tr > th,
#build > div > form > table > tbody.infos > tr > td {
  background-color: var(--nm-base) !important;
  color: var(--nm-white) !important;
}


/* === COMBAT SIMULATOR === */
#combatSimulatorForm > div.role.attacker,
#combatSimulatorForm > div.role.attacker > div.content,
#combatSimulatorForm > div.role.defender,
#combatSimulatorForm > div.role.defender > div.content,
#combatSimulator .results .combatStatistics .additionalRewards {
  background-color: var(--nm-base) !important;
}

#combatSimulator .tribeSelection.reinforcement,
#combatSimulator > div.results > div.result.attack > div.content.preventMobileSwipeNavigation > table > tbody > tr.troopsResult,
#combatSimulator > div.results > div.result.defence > div.content.preventMobileSwipeNavigation > table > tbody > tr.troopsResult {
  background-color: var(--nm-base) !important;
  border-color: var(--nm-border) !important;
}

#combatSimulator .results .combatStatistics table {
  background-color: var(--nm-base) !important;
  color: var(--nm-white) !important;
}


#combatSimulator .results .combatStatistics table thead th {
  background-color: var(--nm-elevated) !important;
  color: var(--nm-white) !important;
}

#combatSimulator .results .combatStatistics table tbody tr:nth-child(2n) th,
#combatSimulator .results .combatStatistics table tbody tr:nth-child(2n) td {
  background-color: var(--nm-elevated) !important;
  color: var(--nm-white) !important;
}


/*result statistics rows 1*/
#combatSimulator > div.results > div.combatStatistics > table > tbody > tr:nth-child(1),
#combatSimulator > div.results > div.combatStatistics > table > tbody > tr:nth-child(3) {
  background-color: var(--nm-base) !important;
  color: var(--nm-white) !important;
}

#combatSimulator .results .separator .title {
  background-color: var(--nm-base) !important;
  color: var(--nm-white) !important;
}

#combatSimulator .results .combatStatistics table tbody tr td {
  background-color: var(--nm-base) !important;
  color: var(--nm-white) !important;
}


#combatSimulator .results .result {
  background-color: var(--nm-base) !important;
}


/* === HERO === */
#heroes {
  color: var(--nm-white) !important;
}

.heroItemV1.notClickable { cursor: default !important; }

#heroV2 > div:nth-child(7) > div.formV2.heroHideSwitch > label > div.label {
  color: var(--nm-white) !important;
}

#content.heroV2Attributes .attributeBox::before {
  background-color: var(--nm-base) !important;
}

#heroV2 > div:nth-child(4) > div > div.changeProduction > div.resource > span {
  background-color: var(--nm-elevated) !important;
  color: var(--nm-white) !important;
}

#heroV2 > div:nth-child(4) > div > div.changeProduction .bar {
  --backgroundColorStart: var(--nm-dim);
  --backgroundColorEnd: var(--nm-dim);
}

.featureDescription {
  color: var(--nm-white) !important;
}

#heroAdventure > div.videoFeatureBonusBox.adventureDuration.watchReady > div.featureDescription {
  color: var(--nm-white) !important;
}

img.hero_on_adventure {
  filter: invert(1) hue-rotate(0deg) !important;
}


/* === AUCTION HOUSE === */
.auctionsBuy,
.auctionsSell {
  color: var(--nm-white) !important;
}

/* Force all text elements within the wrapper to use the white color variable */
.itemTypeListWrapper,
.itemTypeListWrapper th,
.itemTypeListWrapper td,
.itemTypeListWrapper span,
.itemTypeListWrapper div,
.itemTypeListWrapper strong {
  color: var(--nm-white) !important;
}

.videoFeature * {
    color: var(--nm-white) !important;
}

.ongoingSellListWrapper * {
    color: var(--nm-white) !important;
}

.description * {
  color: var(--nm-white) !important;
}

table.itemType th {
  background-color: var(--nm-elevated) !important;
}

table.itemType td {
  background-color: var(--nm-base) !important;
}

table.itemType td.heroItemImage {
  background-color: var(--nm-card) !important;
}

button.active[class*="listLayout"] {
  background-color: var(--nm-elevated) !important;
}

#auctions > div.groupAndControls > div.listControl > div.controlSection.listLayout > button,
#auctions > div.groupAndControls > div.listControl > div.controlSection.reload,
#auctions > div.groupAndControls > div.listControl > div.controlSection.reload > button {
  color: var(--nm-white) !important;
}

#auctions > div.heroV2.sell > div.sellItems > div.description > h3,
#auctions > div.heroV2.sell > h3,
#auctions > div:nth-child(4) > div.listHeadline > h4,
#auctions > div:nth-child(5) > h4 {
  color: var(--nm-white) !important;
}

button.icon {
  position: relative;
  /* We set background-image to none on the button itself 
     so we can move it to the pseudo-element */
  background-image: none; 
  isolation: isolate;
  background-color: transparent;
  display: inline-grid;
  place-items: center;
}

button.icon::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: -1; /* Place it behind the image */
  
  /* Apply the background image here */
  background-image: url("https://cdn.legends.travian.com/gpack/389.1/img_ltr/legacy/components/button/buttonSmall.png");
  background-size: cover;
  
  /* Apply your filter here */
  filter: grayscale(1) brightness(0.5) opacity(0.5);
  
  pointer-events: none; /* Make sure it doesn't block clicks */
}

#auctions > div.groupAndControls > div.formV2.buyViewSwitch > label > div.label {
  background-color: var(--nm-base) !important;
  color: var(--nm-white) !important;
}


/* === FARM LIST === */
#content.buildRallyPointFarmList .villageWrapper .farmListWrapper .farmListHeader:before {
  background-color: var(--nm-base) !important;
   color: var(--nm-white) !important;}

/* Highlighted farm-list target row — replace pale-green with theme grey */
#content.buildRallyPointFarmList tr.slot.highlighted > td {
  background-color: var(--nm-hover) !important;
}

/* Farm-list sort context menu — grey background, bring above other UI.
   The wrapper is parented to th.lastRaid. The header-darkening rule above
   uses :not(:has(.contextMenuWrapper)) so the cell's isolation:isolate drops
   the moment Travian inserts the menu, letting z-index:2000 stack at the
   document root. */
.contextMenuWrapper {
  z-index: 2000 !important;
}
.contextMenu.from.sorting {
  background-color: var(--nm-card) !important;
  border-color: var(--nm-dim) !important;
}
.contextMenu.from.sorting a:hover {
  background-color: var(--nm-hover) !important;
}
/* Currently-selected sort option — Travian paints this beige by default.
   The active option is the one whose .sortingArrow is NOT .inactive. */
.contextMenu.from.sorting a:has(.sortingArrow:not(.inactive)) {
  background-color: var(--nm-hover) !important;
  background-image: none !important;
}
/* "Sort by" header text — Travian leaves it green-tinted; force theme white. */
.contextMenu.from.sorting .description {
  color: var(--nm-white) !important;
}
/* Total bounty option: Travian's inline sum (Σ) SVG renders at 0x0 with black
   fill, so the icon is invisible. Size it to match sibling <i> icons (16x16)
   and color the path with the theme white. */
.contextMenu.from.sorting a.totalBounty > svg:not(.sortingArrow) {
  width: 16px !important;
  height: 16px !important;
  display: block !important;
}
.contextMenu.from.sorting a.totalBounty > svg:not(.sortingArrow) path {
  fill: var(--nm-white) !important;
}

.formV2 label.checkbox input:not([type=checkbox]):not([type=radio]), .formV2 label.checkbox select, .formV2 label.checkbox textarea, .formV2 label.input input:not([type=checkbox]):not([type=radio]), .formV2 label.input select, .formV2 label.input textarea, .formV2 label.radio input:not([type=checkbox]):not([type=radio]), .formV2 label.radio select, .formV2 label.radio textarea, .formV2 label.select input:not([type=checkbox]):not([type=radio]), .formV2 label.select select, .formV2 label.select textarea, .formV2 label.switch input:not([type=checkbox]):not([type=radio]), .formV2 label.switch select, .formV2 label.switch textarea, .formV2 label.textarea input:not([type=checkbox]):not([type=radio]), .formV2 label.textarea select, .formV2 label.textarea textarea {
  background-color: var(--nm-base) !important;
  color: var(--nm-white) !important;
  border-color: var(--nm-dim) !important;
}

#createFarmListForm > div.onlyLossesSelection > label > div {
  color : var(--nm-white) !important;
}

#_o-preview-unit {
  color: var(--nm-white) !important;
}

#farmListTargetForm > div.deactivateSlot > label > div {
  color : var(--nm-white) !important;
}

#createFarmListForm > h4 {
color: var(--nm-white) !important;
}

#createFarmListForm > label.input.valid > div.label.pinned {
  background-color: var(--nm-base) !important;
  color: var(--nm-white) !important;
}

#createFarmListForm > label.select.valid > div.label.pinned {
  background-color: var(--nm-base) !important;
  color: var(--nm-white) !important;
}

#farmListTargetForm > div.listSelector > label > div.label.pinned {
  background-color: var(--nm-base) !important;
  color: var(--nm-white) !important;
}

#farmListTargetForm > div.targetSelection > div.inputWrapper > label.input.search > div {
  background-color: var(--nm-base) !important;
  color: var(--nm-white) !important;
}

#farmListTargetForm > div.targetSelection > div.inputWrapper > label.input.coordinateX.withCustomValidationRenderElement.valid > div.label.pinned {
  background-color: var(--nm-base) !important;
  color: var(--nm-white) !important;
}

#farmListTargetForm > div.targetSelection > div.inputWrapper > label.input.coordinateY.withCustomValidationRenderElement.valid > div.label.pinned {
  background-color: var(--nm-base) !important;
  color: var(--nm-white) !important;
}

#farmListTargetForm > h4 {
  color: var(--nm-white) !important;
}

#tradeRoutes > div.tradeRouteCollection > form > table > tbody * {
  background-color: var(--nm-base) !important;
  color: var(--nm-white) !important;
}

#tradeRoutes > div.tradeRouteCollection > form > table > thead > tr > th.resources {
  color: var(--nm-white) !important;
}
div.alliance .chartHeadline {
  color: var(--nm-white) !important;
}

#top10_offs > tbody *,
#top10_defs > tbody *,
#top10_raiders > tbody * {
  background-color: var(--nm-base) !important;
  color: var(--nm-white) !important;
}


/* === MARKETPLACE === */
.buildMarketplace,
#marketplaceSendResources {
  color: var(--nm-white) !important;
}

.headline::before {
  background-color: var(--nm-base) !important;
}

#tradeRoutes > div.tradeRouteCollection > div > div {
  color: var(--nm-white) !important;
}

#content.buildMarketTradeRoutes .tradeRouteCollection table thead th.departure svg, #content.buildMarketTradeRoutes .tradeRouteCollection table thead th.merchants svg {
  fill : var(--nm-gold) !important;
}

#tradeRoutes > div.tradeRouteCollection > div > div.nextDelivery > svg {
  fill: var(--nm-gold) !important;
}

#tradeRouteEditCreate > div.targetSelector > div.destinationOptions > label > div {
  color: var(--nm-white) !important;
}

#tradeRouteEditCreate > div.deactivateTradeRoute > label > div {
  color: var(--nm-white) !important;
}

#tradeRouteEditCreate > div.deliveriesSelector > label > div > span {
  color: var(--nm-white) !important;
}

#tradeRouteEditCreate > div.timeSelector > label > div {
  color: var(--nm-white) !important;
}

#combatSimulatorForm > div.role.reinforcement > div.content {
  background-color: var(--nm-base) !important;
}

#farmListTargetForm > div.noticeBox.indeterminateTroopsNotice {
  --boxBorderColor: var(--nm-base) !important; 
  --boxBackgroundColor: var(--nm-base) !important;

}

#dialogContent > h1 {
  color: var(--nm-white) !important;
}

body > div.dialogOverlay.allowMobileSidebars.dialogVisible > div > div > div > div > form > div.title {
  background-color: var(--nm-base) !important;
}

/* Marketplace gold text */
#npc_market_button > span { color: var(--nm-base) !important; }

#marketplaceSendResources > div > div > div.groupHeader > div.title {
  color: var(--nm-white) !important;
}

#content.buildMarketSendResources .groupHeader::before {
  background-color: var(--nm-base) !important;
}

#marketplaceSendResources > div > div > div.listHeader {
  background-color: var(--nm-base) !important;
}

#marketplaceSendResources > div > div > div.listHeader > div.resources {
  color: var(--nm-white) !important;
}

#marketplaceSendResources > div > form > div > h3,
#marketplaceSendResources > div > h3 {
  color: var(--nm-white) !important;
}

.resourceWrapper.charges .transfer.fillUp {
  background-color: transparent !important;
  border-color: var(--nm-gold) !important;
}

#marketplaceSendResources > div > div.merchantsInformation {
  background-color: var(--nm-base) !important;
}

#marketplaceSendResources > div > div.merchantsInformation > div.available {
  color: var(--nm-white) !important;
}

#marketplaceOffer > div.merchantsInformation {
  background-color: var(--nm-base) !important;
  color: var(--nm-white) !important;
}

#marketplaceOffer > div.merchantsInformation > div.available > span {
  background-color: var(--nm-base) !important;
  color: var(--nm-muted) !important;
}

._r-label {
  color: var(--nm-white) !important;
}

._r-unit-item span {
  color: var(--nm-white) !important;
}

._r-unit-hint {
  color: var(--nm-muted) !important;
}

._r-cost-header {
  color: var(--nm-white) !important;
}

._r-buildinfo-row {
  color: var(--nm-white) !important;
}

div.reports #reportWrapper .animalReport * {
  color: var(--nm-white) !important;
  background-color: var(--nm-base) !important;
}

._r-cost-val {
  color: var(--nm-white) !important;
}

#activate > div > div.selection.selectTribe > div.description.tribeDescription * {
  color: var(--nm-base) !important;
}

#paymentWizardContent > div.contentArea > div > div.purchaseStepWrapper > div.confirmation.billingInformation.specialOffersGoldNotTransferable * {
  color: var(--nm-base) !important;
}

#heroV2 > div:nth-child(6) > div.formV2.heroHideSwitch > label > div.label {
  color: var(--nm-white) !important;
}

#reportWrapper > div.body > div.role.attacker > table.additionalInformation > tbody > tr > td > div:nth-child(2) > div > div:nth-child(2) > span > span * {
  color: var(--nm-white) !important;
}

#activate > div > div.selection.selectTribe > div.description.tribeDescription > div.optionDescription.option0.tribe1 > div *,
#activate > div > div.selection.selectTribe > div.description.tribeDescription > div.optionDescription.option0.tribe2 > div *,
#activate > div > div.selection.selectTribe > div.description.tribeDescription > div.optionDescription.option0.tribe3 > div * {
  color: var(--nm-white) !important;
}

._r-highlight,
#_r-resource-preview > div._r-preview-header > span._r-preview-total._r-ok {
  color: var(--nm-green) !important;
}

#_r-resource-preview > div._r-preview-warn {
  background-color: var(--nm-elevated) !important;
  color: var(--nm-white) !important;
}

#_r-resource-preview > div._r-preview-header > span:nth-child(1),
#_r-resource-preview > div._r-preview-grid > div:nth-child(1),
#_r-resource-preview > div._r-preview-grid > div:nth-child(2),
#_r-resource-preview > div._r-preview-grid > div:nth-child(3),
#_r-resource-preview > div._r-preview-grid > div:nth-child(4),
#_r-resource-preview > div._r-preview-grid > div:nth-child(1) > span._r-preview-need,
#_r-resource-preview > div._r-preview-grid > div:nth-child(2) > span._r-preview-need,
#_r-resource-preview > div._r-preview-grid > div:nth-child(3) > span._r-preview-need,
#_r-resource-preview > div._r-preview-grid > div:nth-child(4) > span._r-preview-need {
  color: var(--nm-white) !important;
}

#_r-can-_r-preview-warn > div {
  background-color: var(--nm-elevated) !important;
  color: var(--nm-white) !important;
}

#marketplaceOffer > div.headerWrapper > h3 {
  color: var(--nm-white) !important;
}

#marketplaceBuy > h3 {
  color: var(--nm-white) !important;
}

div.reports #reportWrapper .tradeReport #trade {
  background-color: var(--nm-base) !important;
}

#marketplaceBuy > div.merchantsInformation {
  background-color: var(--nm-base) !important;
  color: var(--nm-white) !important;
}
  
div.cropfinder div.inputWrapper {
  background-color: var(--nm-base) !important;
}

#marketplaceSendResources > div > form > div > div > div.targetSelection > div.inputWrapper > label.input.search > input[type=text],
#marketplaceSendResources > div > form > div > div > div.targetSelection > div.inputWrapper > label.input.search > div.results {
  background-color: var(--nm-base) !important;
  color: var(--nm-white) !important;
  border-color: var(--nm-muted) !important;
}


/* Coordinate inputs */
#marketplaceSendResources > div > form > div > div > div.targetSelection > div.inputWrapper > label.input.coordinateX > input[type=text],
#marketplaceSendResources > div > form > div > div > div.targetSelection > div.inputWrapper > label.input.coordinateY > input[type=text] {
  background-color: var(--nm-base) !important;
  color: var(--nm-white) !important;
  border-color: var(--nm-muted) !important;
}

#marketplaceSendResources > div > form > div > div > div.targetSelection > div.inputWrapper > label.input.coordinateX > div.label,
#marketplaceSendResources > div > form > div > div > div.targetSelection > div.inputWrapper > label.input.coordinateY > div.label {
  color: var(--nm-white) !important;
}

#marketplaceSendResources > div > form > div > div > div.targetSelection > div.inputWrapper > label.input.search > div {
  background-color: var(--nm-base) !important;
  color: var(--nm-white) !important;
}

#marketplaceSendResources > div > form > div > div > div.targetSelection > div.inputWrapper > label.input.search > div.label,
#marketplaceSendResources > div > form > div > div > div.targetSelection > div.inputWrapper > label.input.coordinateX.withCustomValidationRenderElement.valid > div.label.pinned,
#marketplaceSendResources > div > form > div > div > div.targetSelection > div.inputWrapper > label.input.coordinateY.withCustomValidationRenderElement.valid > div.label.pinned {
  color: var(--nm-white) !important;
  background-color: transparent !important;
}

/* Pinned (floating) state of search-input label — white pill with base text.
   Also fires on :focus-within because Travian doesn't add .pinned for empty-but-focused. */
#marketplaceSendResources > div > form > div > div > div.targetSelection > div.inputWrapper > label.input.search > div.label.pinned,
#marketplaceSendResources > div > form > div > div > div.targetSelection > div.inputWrapper > label.input.search:focus-within > div.label {
  color: var(--nm-base) !important;
  background-color: var(--nm-white) !important;
}

/* Delivery amount */
#marketplaceSendResources > div > form > div > div > div.deliveriesSelector > label > div > span {
  color: var(--nm-white) !important;
}

#marketplaceSendResources > div > div:nth-child(4) > div.listFooter {
  background-color: var(--nm-base) !important;
}


/* === STATISTICS === */
#statisticsV2 {
  color: var(--nm-white) !important;
}

#statisticsV2 h4 {
  color: var(--nm-white) !important;
}

/* Recharts chart text (axis labels, pie chart values) */
.recharts-layer text,
.recharts-text {
  fill: var(--nm-white) !important;
}

#serverProgression > h4 {
  color: var(--nm-white) !important;
}

#serverProgressionTribeDistribution > div > div.legendContainer > div > table > thead > tr > td:nth-child(2) {
  color: var(--nm-white) !important;
}

#statisticsV2 #militaryStrengthRank td.rank > a {
  color: var(--nm-white) !important;
}

#militaryStrengthRank > div:nth-child(3) > div > div.legendContainer > div.simpleLegend > table > tbody > tr > td.rank > a > span {
  color: var(--nm-base) !important;
}

#militaryStrengthRank td.rank > a {
  color: var(--nm-white) !important;
}

.simpleLegend {
  background-color: var(--nm-card) !important;
}

a.iconButton {
  background-color: var(--nm-card) !important;
  border-color: var(--nm-border) !important;
}

a.iconButton.active {
  background-color: var(--nm-link) !important;
}

.statisticsGeneral h4,
.statistics h4 {
  background-color: var(--nm-green-hdr) !important;
}

.exchangeOfficeDialog #dialogContent #exchangeOffice .valueInput {
  background-color: var(--nm-base) !important;
}

/* === PROFILE === */
.playerProfileOverview {
  color: var(--nm-white) !important;
}


/* === MAP === */
#mapContainer .ruler.x,
#mapContainer .ruler.y {
  background-color: var(--nm-base) !important;
}

#map_details > h4 {
  color: var(--nm-white) !important;
}

#distance {
  background-color: var(--nm-base) !important;
}


#villageInstantTabs > div.contentNavi.tabNavi {
    filter: grayscale(1) contrast(1.18);
}

#tileDetails > h1 > span  {
  color: var(--nm-green) !important;
}

#crud-raidlist-button > span {
  color: var(--nm-white) !important;
}

#tileDetails {
  background-color: var(--nm-base) !important;
  color: var(--nm-white) !important;
}

#oasis1InstantTabs > div.contentNavi.tabNavi > div:nth-child(1) > div.content {
  background-color: var(--nm-elevated) !important;
}

#oasis1InstantTabs > div.contentNavi.tabNavi > div.container.normal > div.content {
  background-color: var(--nm-base) !important;
}

body > div.dialogOverlay.allowMobileSidebars.dialogVisible > div > div > div > div > form > div.dialogDragBar {
  background-color: var(--nm-base) !important;
}

#village_info {
  background-color: var(--nm-base) !important;
  color: var(--nm-white) !important;
}

#distribution {
  background-color: var(--nm-base) !important;
  color: var(--nm-white) !important;
}

#troop_info {
  background-color: var(--nm-base) !important;
  color: var(--nm-white) !important;
}

#mapContainer:before {
  background-color: var(--nm-base) !important;
}


/* === MESSAGES/REPORTS === */
td.sel,
td.subject,
td.send,
td.dat {
  background-color: var(--nm-base) !important;
}

#culture_points > thead > tr > td,
#culture_points > tbody > tr.sum > td,
#culture_points > tbody > tr.hl > td {
  color: var(--nm-white) !important;
  background-color: var(--nm-elevated) !important;
}

#overview > thead > tr > th,
#inbox-size-table > thead > tr > td,
#reportsForm > div.reportFilter,
#overview > tbody > tr > td {
  color: var(--nm-white) !important;
  background-color: var(--nm-base) !important;
}

div.village3 table#troops td, div.village3 table#troops th, div.village3 table.under_progress td, div.village3 table.under_progress th, div.village3 table.vil_troops td, div.village3 table.vil_troops th {
  color: var(--nm-white) !important;
  background-color: var(--nm-elevated) !important;
}

div.village3 table#troops th.villageName,
div.village3 table#troops td {
  color: var(--nm-white) !important;
  background-color: var(--nm-elevated) !important;
}

#build > div > table > thead > tr > td,
#build > div > table.troop_details.outRaid > tbody > tr > th,
#build > div > table.troop_details.outRaid > tbody > tr > th,
#build > div > table > tbody > tr > td,
#build > div > table.troop_details.inReturn > tbody > tr > th,
#build > div > table > tbody > tr > th {
  color: var(--nm-white) !important;
  background-color: var(--nm-elevated) !important;
}

#reportWrapper > div.body > div.role.defender > table > tbody > tr > th,
#reportWrapper > div.body > div.role.attacker > table > tbody > tr > th {
  color: var(--nm-white) !important;
  background-color: var(--nm-base) !important;
}

#reportWrapper > div.body > div.combatStatistics > table > thead > tr > th,
#reportWrapper > div.body > div.combatStatistics > table > tbody > tr > th,
#reportWrapper > div.body > div.combatStatistics > table,
#reportWrapper > div.body > div.combatStatistics > table > tbody > tr > td {
  color: var(--nm-white) !important;
  background-color: var(--nm-base) !important;
}

div#build table#build_value td, div#build table#build_value th {
  background-color: transparent !important;
}

div table#warehouse thead td,
#warehouse > tbody > tr > td,
#production > thead > tr > td,
#production > tbody > tr.hl > td,
#production > tbody > tr.sum > td,
#capacity > thead > tr > td,
#capacity > tbody > tr.hl > td,
#capacity > tbody > tr.sum > td {
  color: var(--nm-white) !important;
  background-color: var(--nm-elevated) !important;
}

#overview > tbody > tr > td.sub.newMessage,
#overview > tbody > tr > td.sub {
  background-color: var(--nm-base) !important;
}


/* report unread icon*/
div.reports table#overview td.sub .messageStatusUnread {
  filter: contrast(1.27) brightness(0.83) saturate(1.85);
}
/* report read icon*/
div.reports table#overview td.sub .messageStatusRead {
  filter: hue-rotate(157deg) contrast(1.1) brightness(0.67) saturate(1.2);
}

.tlw-oasis-sum {
  color: var(--nm-white) !important;
}

#overview > tbody > tr > td.tra.lc > a {
  color: var(--nm-gray) !important;
}

#overview > tbody > tr: > td.vil.fc > a {
  color: var(--nm-link) !important;
}

#_o-troop-hero {
  background-color: var(--nm-white) !important;
}

#inbox-size-table {
  background-color: var(--nm-border) !important;
}

#reportWrapper > div.header,
#reportWrapper > div.body > div > table > tbody.infos > tr > th,
#reportWrapper > div.body > div > table > tbody.goods > tr > th {
  background-color: var(--nm-base) !important;
  color: var(--nm-white) !important;
}

#reportWrapper > div.body > div.role {
  background-color: var(--nm-base) !important;
  color: var(--nm-white) !important;
}

#reportWrapper > div.body > div.role > div.troopHeadline {
  background-color: var(--nm-base) !important;
  color: var(--nm-white) !important;
}

#reportWrapper > div.body > div.role > table {
  background-color: var(--nm-base) !important;
  color: var(--nm-white) !important;
}

#reportWrapper > div.body > div > div > div.participants {
  background-color: var(--nm-base) !important;
  color: var(--nm-white) !important;
}

#reportWrapper > div.body > div > table.supportTroops,
#reportWrapper > div.body > div > table.additionalInformation {
  background-color: var(--nm-base) !important;
  color: var(--nm-white) !important;
}

i[class*="carry"] {
  filter: brightness(0.65) contrast(2.5);
}

/*background*/
#reportWrapper .iconButton:not(.disabled):before, 
#reportWrapper button.icon:not(.disabled):before {
  background-color: var(--nm-base) !important;
}
#reportWrapper .iconButton:not(.disabled):after, 
#reportWrapper button.icon:not(.disabled):after {
filter: brightness(0.5) contrast(1.9) !important;
}

/*frame*/
#reportWrapper button.icon:not(.disabled) {
  background-color: var(--nm-base) !important;
}

/*icons*/
#reportWrapper button.icon i,
#reportWrapper .iconButton i {
  filter: brightness(1.04) contrast(1.1) !important;
}

i.troopDead_small {
  filter: brightness(1.499) contrast(2.5) !important;
}

/* === MISC === */
.progressBar .bar {
  background-color: var(--nm-border) !important;
}

#content > h4 {
  color: var(--nm-white) !important;
}

#build .upgradeBuilding {
  border: solid 1px var(--nm-white) !important;
}

#expansionSettlements > div,
h4.round {
  background-color: var(--nm-elevated) !important;
  border-color: var(--nm-white) !important;
  color: var(--nm-white) !important;
}

#build .buildingDescription .headline {
  filter: grayscale(1) brightness(0.86);
}

td.vil.fc {
  color: var(--nm-link) !important;
}

.dialogContents:before {
  filter: grayscale(0.7) brightness(1.2) !important;
}

/* Precise Global Selector for common game frames */
.dialogContents::after,
.content::before,
.boxTitle::after,
.expansionSlotInfo::after,
#contentOuterContainer::before,
#contentOuterContainer::after {
  filter: grayscale(0.7) brightness(1.2);
}

/* 1. THE MAIN BOX FILL */
.quests .dailyQuest,
.quests .dailyQuest::before {
  background-color: var(--nm-base) !important;
  background-image: none !important;
}

/* 2. THE DECORATIVE ORNAMENTS (near the title) */
.quests .dailyQuest .titleDecoration,
.quests .dailyQuest .titleDecoration::before,
.quests .dailyQuest .titleDecoration::after,
.quests .dailyQuest .tasks > div {
  background-color: var(--nm-elevated) !important; /* Change this color */
  background-image: none !important;
}

#dailyQuestsRewardScreen > div.rewardWrapper > div.titleDecoration::before,
#dailyQuestsRewardScreen > div.rewardWrapper > div.titleDecoration::after {
  background-color: var(--nm-elevated) !important; /* Change this color */
  background-image: none !important;
}

#dailyQuests #dailyQuestsRewardScreen .rewardWrapper:before{
  background-color: var(--nm-base) !important;
}

.rewardWrapper::before {
    background-color: var(--nm-base) !important;
    background-image: none !important;
}

/* 3. THE POINTS BOX (the counter part) */
.quests .dailyQuest .questAchievedPoints,
.quests .dailyQuest .questAchievedPoints .points,
.quests .dailyQuest .questAchievedPoints::before,
.quests .dailyQuest .questAchievedPoints::after {
  background-color: transparent !important; /* Change this color */
  background-image: none !important;
}

#dailyQuests .dailyQuest .tasks>div.completed,
#dailyQuests .dailyQuest .tasks>div.completed:before {
  border-color: var(--nm-gold) !important;
  background-color: var(--tw-c-purple) !important;
}

#dailyQuests .dailyQuest .tasks>div .laurelIcon use,
#dailyQuests .dailyQuest .tasks>div span {
  fill: var(--nm-white) !important;
  color : var(--nm-white) !important;
}

#dailyQuestsRewardScreen > div.rewardWrapper > div.iconValueBoxWrapper > div > span > span {
  color: var(--nm-base) !important;

}
`,

	// ────────────────────────────────────────────────────────────
	// THIRD-PARTY EXTENSIONS (Highest specificity)
	// ────────────────────────────────────────────────────────────
	extensions: `
/* === RALLY HELPER / AUTOMERCHANT === */
._r-panel {
  background-color: var(--nm-base) !important;
}

#_rh-summary > div:nth-child(1) {
  color: var(--nm-link) !important;
}

#_rh-summary > div:nth-child(2) {
  color: var(--nm-white) !important;
}

#_rh-summary > div._r-resource.partial > span._r-resource-name {
  background-color: var(--nm-elevated) !important;
  color: var(--nm-white) !important;
}

#_rh-summary > div._r-resource.partial {
  background-color: var(--nm-elevated) !important;
  color: var(--nm-white) !important;
}

#_rh-ui {
  background-color: var(--nm-base) !important;
  color: var(--nm-white) !important;
}

#_r-tribe-select,
#_r-server-type,
#_r-troop-body {
  background-color: var(--nm-base) !important;
  color: var(--nm-white) !important;
}

#_r-troop-body > div {
  color: var(--nm-white) !important;
}

#_rh-ui > div > div._r-tabs > button {
  background-color: var(--nm-card) !important;
  color: var(--nm-gold) !important;
  box-shadow: 0 -10px 2px -5px rgba(0,0,0,.45) inset, 0 20px 10px -5px rgba(0,0,0,.2) inset !important;
  border-top: solid 1px #2d1408 !important;
  border-bottom: solid 1px #d7b672 !important;
}

#_rh-ui > div > div._r-tabs > button._r-tab.active {
  background-color: var(--nm-elevated) !important;
  color: var(--nm-gold) !important;
}

._r-info-block.warn {
  background-color: var(--nm-base) !important;
}

._ov-t {
  color: var(--nm-white) !important;
}

#overview > tbody > tr > td.vil.fc > span {
  color: var(--nm-base) !important;
}

#productionOverview > div > div > div > div.productionPerHour > h4 {
  color: var(--nm-white) !important;
}

#productionOverview > div > div > div.total.productionContainer > div.productionPerHourTotal > h4 {
  color: var(--nm-white) !important;
}

div.cropBalanceContainer .balanceTroops {
  background-color: var(--nm-base) !important;
}

._r-unit-item.active {
  background-color: var(--nm-elevated) !important;
  color: var(--nm-white) !important;
}

#_r-unit-list > div {
  background-color: var(--nm-elevated) !important;
  color: var(--nm-white) !important;
}

#_r-troop-cost > div._r-cost-grid > div {
  background-color: var(--nm-elevated) !important;
  color: var(--nm-white) !important;
}

#_r-can-build > div {
  background-color: var(--nm-elevated) !important;
  color: var(--nm-white) !important;
}
`,
};

// ════════════════════════════════════════════════════════════════
// STATE & DOM HELPERS
// ════════════════════════════════════════════════════════════════

const { styleId, buttonStyleId, themeAttribute, themeValues, defaultButtonColor } =
	NIGHT_MODE_CONFIG;

let themeObserver = null;
let currentButtonColor = defaultButtonColor;

// Adds a <style> with the given id once; its CSS never changes afterwards.
function ensureStyle(id, cssText) {
	if (document.getElementById(id)) return;
	const style = document.createElement("style");
	style.id = id;
	style.textContent = cssText;
	(document.head || document.documentElement).appendChild(style);
}

function removeCSS() {
	document.getElementById(styleId)?.remove();
	document.getElementById(buttonStyleId)?.remove();
	document.documentElement.style.removeProperty("--nm-btn-purple");
}

/**
 * Keeps the game's own night theme switched on. Only <body>'s data-theme
 * attribute is watched; at document_start <body> doesn't exist yet, so until it
 * does only <html>'s direct children are watched for it to appear.
 */
function startThemeObserver() {
	stopThemeObserver();
	let watched = null;
	const enforce = () => {
		const body = document.body;
		if (!body) return;
		if (body.getAttribute(themeAttribute) !== themeValues.dark) {
			body.setAttribute(themeAttribute, themeValues.dark);
		}
		if (watched !== body) {
			watched = body;
			themeObserver.disconnect();
			themeObserver.observe(body, { attributeFilter: [themeAttribute] });
		}
	};
	themeObserver = new MutationObserver(enforce);
	themeObserver.observe(document.documentElement, { childList: true });
	enforce();
}

function stopThemeObserver() {
	themeObserver?.disconnect();
	themeObserver = null;
}

function setNightMode(isEnabled) {
	if (isEnabled) {
		ensureStyle(styleId, Object.values(THEME).join("\n\n"));
		applyButtonColor();
		startThemeObserver();
	} else {
		stopThemeObserver();
		document.body?.setAttribute(themeAttribute, themeValues.light);
		removeCSS();
	}
}

/**
 * Opt-in round-button recolor. Lives in its own <style> element so it can be
 * added (custom color picked) or removed (default setting → native buttons)
 * independently of the main theme. Colors derive from --nm-btn-purple via
 * oklch() so hue and saturation track the picked color.
 */
const ROUND_BUTTON_SHADOW =
	"inset 0 -2px 1px 1px oklch(from var(--nm-btn-purple) calc(l - 0.14) c h), inset 2px -1px 1px 0 oklch(from var(--nm-btn-purple) calc(l + 0.14) calc(c * 1.08) h), inset -2px -1px 1px 0 oklch(from var(--nm-btn-purple) calc(l + 0.1) calc(c * 1.05) h), inset 0 2px 2px 1px oklch(from var(--nm-btn-purple) calc(l + 0.1) c h) !important";
const ROUND_BUTTON_RECOLOR_CSS = `
.buttonFramed.round.green:before {
  background-color: var(--nm-btn-purple) !important;
  /* Vanilla round-button frame border (#34220d, fully round), preserved on the
     recolored disc so it keeps Travian's crisp dark edge. */
  border: 1px solid #34220d !important;
  border-radius: 50% !important;
  box-shadow: ${ROUND_BUTTON_SHADOW};
}
.buttonFramed.round.green:hover::before {
  filter: brightness(1.15) !important;
  background-color: var(--nm-btn-purple) !important;
  box-shadow: ${ROUND_BUTTON_SHADOW};
}
.buttonFramed.round.green.disabled:before {
  background-color: var(--nm-btn-purple) !important;
  box-shadow: ${ROUND_BUTTON_SHADOW};
  filter: saturate(0.2) brightness(0.72) !important;
}`;

/**
 * Adds or removes the round-button recolor based on the current setting:
 *   - default sentinel → remove the override → the game's native buttons
 *   - any hex color    → inject the override, tinted to that color
 * Also removes the override when night mode is off. A color change only
 * updates the CSS variable; the stylesheet itself is never re-parsed.
 */
function applyButtonColor() {
	const rootStyle = document.documentElement.style;
	if (
		!document.getElementById(styleId) ||
		!currentButtonColor ||
		currentButtonColor === defaultButtonColor
	) {
		document.getElementById(buttonStyleId)?.remove();
		rootStyle.removeProperty("--nm-btn-purple");
		return;
	}
	rootStyle.setProperty("--nm-btn-purple", currentButtonColor);
	ensureStyle(buttonStyleId, ROUND_BUTTON_RECOLOR_CSS);
}

// ════════════════════════════════════════════════════════════════
// INITIALIZATION
// ════════════════════════════════════════════════════════════════

chrome.storage.local
	.get({
		[NIGHT_MODE_CONFIG.storageKey]: NIGHT_MODE_CONFIG.defaultEnabled,
		[NIGHT_MODE_CONFIG.buttonColorKey]: defaultButtonColor,
	})
	.then((result) => {
		currentButtonColor = result[NIGHT_MODE_CONFIG.buttonColorKey] || defaultButtonColor;
		setNightMode(result[NIGHT_MODE_CONFIG.storageKey]);
	})
	.catch(() => setNightMode(NIGHT_MODE_CONFIG.defaultEnabled));

// Messages from the popup (toggle and/or button color change).
chrome.runtime.onMessage.addListener((message) => {
	if (typeof message?.buttonColor === "string") {
		currentButtonColor = message.buttonColor;
		applyButtonColor();
	}
	if (typeof message?.nightMode === "boolean") setNightMode(message.nightMode);
});
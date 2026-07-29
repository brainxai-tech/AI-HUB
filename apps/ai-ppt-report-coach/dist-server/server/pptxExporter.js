import PptxGenJS from "pptxgenjs";
const themes = {
    executive: { navy: "10233D", accent: "F2664B", paper: "F7F5F0", ink: "172234", muted: "687386", pale: "E9EEF3" },
    warm: { navy: "44312B", accent: "C86F4B", paper: "FAF4EA", ink: "332823", muted: "7A6C65", pale: "EEE2D4" },
    minimal: { navy: "171717", accent: "3F70D7", paper: "F7F7F5", ink: "1C1C1C", muted: "6B6B6B", pale: "EAEAEA" }
};
export async function buildPptxBuffer(report, themeName = "executive") {
    const PptxConstructor = PptxGenJS;
    const pptx = new PptxConstructor();
    const theme = themes[themeName];
    pptx.layout = "LAYOUT_WIDE";
    pptx.author = "Briefly · AI PPT 汇报教练";
    pptx.company = "Briefly";
    pptx.subject = report.subtitle;
    pptx.title = report.title;
    pptx.lang = "zh-CN";
    pptx.theme = {
        headFontFace: "Microsoft YaHei",
        bodyFontFace: "Microsoft YaHei",
        lang: "zh-CN"
    };
    pptx.defineSlideMaster({
        title: "BRIEFLY",
        background: { color: theme.paper },
        objects: [
            { rect: { x: 0, y: 0, w: 0.16, h: 7.5, fill: { color: theme.accent }, line: { color: theme.accent } } },
            { text: { text: "BRIEFLY · AI PPT 汇报教练", options: { x: 0.55, y: 7.12, w: 4.2, h: 0.18, fontFace: "Aptos", fontSize: 7.5, color: theme.muted, charSpacing: 1.1, margin: 0 } } }
        ],
        slideNumber: { x: 12.2, y: 7.08, w: 0.45, h: 0.22, fontFace: "Aptos", fontSize: 8, color: theme.muted, align: "right", margin: 0 }
    });
    report.slides.forEach((slide, index) => {
        if (index === 0 || slide.visualType === "title") {
            addCoverSlide(pptx, report, slide, theme);
        }
        else if (slide.visualType === "closing") {
            addClosingSlide(pptx, report, slide, theme);
        }
        else {
            addContentSlide(pptx, slide, theme);
        }
    });
    const output = await pptx.write({ outputType: "nodebuffer" });
    return Buffer.isBuffer(output) ? output : Buffer.from(output);
}
function addCoverSlide(pptx, report, slideData, theme) {
    const slide = pptx.addSlide();
    slide.background = { color: theme.navy };
    slide.addShape(pptx.ShapeType.rect, { x: 0.62, y: 0.62, w: 0.16, h: 1.08, fill: { color: theme.accent }, line: { color: theme.accent } });
    slide.addText("DECISION BRIEF", { x: 1.03, y: 0.66, w: 3.2, h: 0.28, fontFace: "Aptos", fontSize: 10, bold: true, color: "F6A894", charSpacing: 2.2, margin: 0 });
    slide.addText(report.title, { x: 1.02, y: 1.58, w: 10.9, h: 1.48, fontFace: "Microsoft YaHei", fontSize: 29, bold: true, color: "FFFFFF", breakLine: false, valign: "mid", margin: 0, fit: "shrink" });
    slide.addText(report.subtitle, { x: 1.04, y: 3.25, w: 10.2, h: 0.54, fontFace: "Microsoft YaHei", fontSize: 14, color: "CCD7E4", margin: 0, fit: "shrink" });
    slide.addShape(pptx.ShapeType.line, { x: 1.04, y: 4.2, w: 10.95, h: 0, line: { color: "40536B", width: 1 } });
    slide.addText("本次希望推动的决定", { x: 1.04, y: 4.55, w: 2.4, h: 0.28, fontFace: "Microsoft YaHei", fontSize: 10, bold: true, color: "F6A894", margin: 0 });
    slide.addText(report.objectiveAudience.decisionWanted, { x: 1.04, y: 4.98, w: 10.4, h: 0.85, fontFace: "Microsoft YaHei", fontSize: 19, bold: true, color: "FFFFFF", margin: 0, fit: "shrink", breakLine: false });
    slide.addText(new Date().toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" }), { x: 1.04, y: 6.75, w: 2.5, h: 0.22, fontFace: "Microsoft YaHei", fontSize: 9, color: "9AA9BA", margin: 0 });
    slide.addText("BRIEFLY", { x: 10.82, y: 6.7, w: 1.2, h: 0.24, fontFace: "Aptos", fontSize: 9, bold: true, color: "9AA9BA", align: "right", charSpacing: 1.8, margin: 0 });
    addNotes(slide, slideData.speakerNotes);
}
function addContentSlide(pptx, slideData, theme) {
    const slide = pptx.addSlide("BRIEFLY");
    slide.addText(slideData.role.toUpperCase(), { x: 0.67, y: 0.45, w: 3.3, h: 0.22, fontFace: "Microsoft YaHei", fontSize: 8.5, bold: true, color: theme.accent, charSpacing: 1.2, margin: 0 });
    slide.addText(slideData.title, { x: 0.67, y: 0.79, w: 11.85, h: 0.7, fontFace: "Microsoft YaHei", fontSize: 22.5, bold: true, color: theme.ink, margin: 0, fit: "shrink", valign: "mid" });
    slide.addShape(pptx.ShapeType.roundRect, { x: 0.67, y: 1.7, w: 11.85, h: 0.68, rectRadius: 0.06, fill: { color: theme.navy }, line: { color: theme.navy } });
    slide.addText(slideData.keyMessage, { x: 0.96, y: 1.88, w: 11.22, h: 0.3, fontFace: "Microsoft YaHei", fontSize: 12.5, bold: true, color: "FFFFFF", margin: 0, fit: "shrink", valign: "mid" });
    slide.addText(toBulletText(slideData.bullets), { x: 0.82, y: 2.77, w: 6.95, h: 2.63, fontFace: "Microsoft YaHei", fontSize: 15, color: theme.ink, breakLine: false, margin: 0.08, breakLineOnOverflow: false, paraSpaceAfterPt: 12, bullet: { indent: 18 }, fit: "shrink", valign: "top" });
    slide.addShape(pptx.ShapeType.roundRect, { x: 8.15, y: 2.77, w: 4.15, h: 2.63, rectRadius: 0.06, fill: { color: theme.pale }, line: { color: theme.pale } });
    drawVisualPlaceholder(pptx, slide, slideData.visualType, theme);
    slide.addText("证据", { x: 0.82, y: 5.73, w: 0.7, h: 0.22, fontFace: "Microsoft YaHei", fontSize: 8.5, bold: true, color: theme.accent, margin: 0 });
    slide.addText(slideData.evidence, { x: 1.52, y: 5.69, w: 5.95, h: 0.54, fontFace: "Microsoft YaHei", fontSize: 9.5, color: theme.muted, margin: 0, fit: "shrink" });
    slide.addText("数据 / 图表建议", { x: 8.15, y: 5.73, w: 1.4, h: 0.22, fontFace: "Microsoft YaHei", fontSize: 8.5, bold: true, color: theme.accent, margin: 0 });
    slide.addText(`${slideData.dataSuggestion}\n${slideData.chartSuggestion}`, { x: 8.15, y: 6.03, w: 4.14, h: 0.74, fontFace: "Microsoft YaHei", fontSize: 8.5, color: theme.muted, margin: 0, fit: "shrink", breakLine: false });
    addNotes(slide, slideData.speakerNotes);
}
function addClosingSlide(pptx, report, slideData, theme) {
    const slide = pptx.addSlide("BRIEFLY");
    slide.addText("NEXT DECISION", { x: 0.67, y: 0.52, w: 2.7, h: 0.22, fontFace: "Aptos", fontSize: 8.5, bold: true, color: theme.accent, charSpacing: 1.5, margin: 0 });
    slide.addText(slideData.title, { x: 0.67, y: 0.92, w: 11.4, h: 0.92, fontFace: "Microsoft YaHei", fontSize: 25, bold: true, color: theme.ink, margin: 0, fit: "shrink" });
    slide.addShape(pptx.ShapeType.roundRect, { x: 0.67, y: 2.25, w: 7.1, h: 3.72, rectRadius: 0.06, fill: { color: theme.navy }, line: { color: theme.navy } });
    slide.addText("请确认", { x: 1.06, y: 2.62, w: 1.2, h: 0.3, fontFace: "Microsoft YaHei", fontSize: 11, bold: true, color: "F6A894", margin: 0 });
    slide.addText(toNumberedText(slideData.bullets), { x: 1.06, y: 3.1, w: 6.15, h: 2.2, fontFace: "Microsoft YaHei", fontSize: 17, bold: true, color: "FFFFFF", margin: 0, paraSpaceAfterPt: 16, fit: "shrink" });
    slide.addShape(pptx.ShapeType.roundRect, { x: 8.12, y: 2.25, w: 4.2, h: 3.72, rectRadius: 0.06, fill: { color: theme.pale }, line: { color: theme.pale } });
    slide.addText("领导可能继续追问", { x: 8.49, y: 2.62, w: 2.7, h: 0.28, fontFace: "Microsoft YaHei", fontSize: 11, bold: true, color: theme.ink, margin: 0 });
    slide.addText(report.leadershipQuestions.slice(0, 3).map((item) => `• ${item.question}`).join("\n\n"), { x: 8.49, y: 3.14, w: 3.43, h: 2.25, fontFace: "Microsoft YaHei", fontSize: 11.5, color: theme.ink, margin: 0, fit: "shrink" });
    slide.addText(report.objectiveAudience.decisionWanted, { x: 0.67, y: 6.35, w: 11.65, h: 0.45, fontFace: "Microsoft YaHei", fontSize: 11, bold: true, color: theme.accent, align: "center", margin: 0, fit: "shrink" });
    addNotes(slide, `${slideData.speakerNotes}\n\n收尾提醒：${report.coaching.finalReminder}`);
}
function drawVisualPlaceholder(pptx, slide, type, theme) {
    const x = 8.56;
    const y = 3.18;
    const accent = theme.accent;
    const dark = theme.navy;
    if (type === "chart" || type === "metrics") {
        [0.65, 1.2, 1.7].forEach((height, index) => {
            slide.addShape(pptx.ShapeType.roundRect, { x: x + index * 0.92, y: y + 1.48 - height, w: 0.62, h: height, rectRadius: 0.03, fill: { color: index === 2 ? accent : dark, transparency: index === 2 ? 0 : 14 }, line: { color: index === 2 ? accent : dark } });
        });
        slide.addShape(pptx.ShapeType.line, { x: x - 0.1, y: y + 1.53, w: 2.85, h: 0, line: { color: theme.muted, width: 1 } });
    }
    else if (type === "timeline" || type === "process") {
        slide.addShape(pptx.ShapeType.line, { x, y: y + 0.78, w: 2.86, h: 0, line: { color: dark, width: 2 } });
        [0, 1, 2].forEach((index) => {
            slide.addShape(pptx.ShapeType.ellipse, { x: x + index * 1.22, y: y + 0.53, w: 0.5, h: 0.5, fill: { color: index === 2 ? accent : dark }, line: { color: theme.paper, width: 2 } });
            slide.addText(String(index + 1), { x: x + index * 1.22, y: y + 0.64, w: 0.5, h: 0.18, fontFace: "Aptos", fontSize: 8, bold: true, color: "FFFFFF", align: "center", margin: 0 });
        });
    }
    else if (type === "comparison") {
        [0, 1, 2].forEach((index) => {
            slide.addShape(pptx.ShapeType.roundRect, { x: x + index * 1.03, y: y + 0.18, w: 0.83, h: 1.5, rectRadius: 0.04, fill: { color: index === 1 ? accent : "FFFFFF" }, line: { color: index === 1 ? accent : "CCD4DC", width: 1 } });
            slide.addText(String.fromCharCode(65 + index), { x: x + index * 1.03, y: y + 0.72, w: 0.83, h: 0.3, fontFace: "Aptos", fontSize: 14, bold: true, color: index === 1 ? "FFFFFF" : dark, align: "center", margin: 0 });
        });
    }
    else {
        slide.addShape(pptx.ShapeType.roundRect, { x, y: y + 0.12, w: 2.95, h: 0.44, rectRadius: 0.03, fill: { color: dark }, line: { color: dark } });
        slide.addShape(pptx.ShapeType.roundRect, { x, y: y + 0.78, w: 2.35, h: 0.24, rectRadius: 0.02, fill: { color: "AAB5C0" }, line: { color: "AAB5C0" } });
        slide.addShape(pptx.ShapeType.roundRect, { x, y: y + 1.18, w: 1.88, h: 0.24, rectRadius: 0.02, fill: { color: accent }, line: { color: accent } });
    }
}
function toBulletText(items) {
    return items.join("\n");
}
function toNumberedText(items) {
    return items.map((item, index) => `${String(index + 1).padStart(2, "0")}  ${item}`).join("\n\n");
}
function addNotes(slide, notes) {
    if (typeof slide.addNotes === "function")
        slide.addNotes(notes);
}

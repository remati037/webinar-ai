import csv,sys
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import ParagraphStyle
src,tel,out=sys.argv[1:4]
prijave=sys.argv[4] if len(sys.argv)>4 else None
pdfmetrics.registerFont(TTFont("A","/System/Library/Fonts/Supplemental/Arial.ttf"))
pdfmetrics.registerFont(TTFont("AB","/System/Library/Fonts/Supplemental/Arial Bold.ttf"))
telefoni={}
prezimena={}
if prijave:
    for x in csv.DictReader(open(prijave,encoding="utf-8-sig")):
        telefoni[x["Email"].strip().lower()]=x["Telefon"]; prezimena[x["Email"].strip().lower()]=x["Prezime"]
telefoni.update({x["Email"].strip().lower():x["Telefon"] for x in csv.DictReader(open(tel,encoding="utf-8-sig")) if x["Telefon"]})
rows=[x for x in csv.DictReader(open(src,encoding="utf-8-sig")) if x["Do minuta"]=="68" and x["Email"].lower()!="marko2000.dev@gmail.com"]
f=lambda x: min(68.0,float(x["Gledao (min)"].replace(",",".")))
rows.sort(key=lambda x:(-int(x["Klik ponuda"]!="0"),-f(x)))
cell=ParagraphStyle("c",fontName="A",fontSize=7.5,leading=9)
data=[["#","Ime","Email","Telefon","Gledao","Klik","Ruka","Poruka"]]
for i,x in enumerate(rows,1):
    data.append([i,Paragraph((x["Ime"]+" "+prezimena.get(x["Email"].strip().lower(),"")).strip(),cell),Paragraph(x["Email"],cell),telefoni.get(x["Email"].strip().lower(),""),
      f"{round(f(x))} min","da" if x["Klik ponuda"]!="0" else "",x["Ruka"] if x["Ruka"]!="0" else "",x["Poruka"] if x["Poruka"]!="0" else ""])
with open(out.rsplit(".",1)[0]+".csv","w",encoding="utf-8",newline="") as fc:
    w=csv.writer(fc); w.writerow(["#","Ime","Email","Telefon","Gledao (min)","Klik ponuda","Ruka","Poruka"])
    for r in data[1:]:
        w.writerow([r[0],r[1].text if hasattr(r[1],"text") else r[1],r[2].text if hasattr(r[2],"text") else r[2],r[3],r[4].replace(" min",""),r[5],r[6],r[7]])
doc=SimpleDocTemplate(out,pagesize=A4,leftMargin=12*mm,rightMargin=12*mm,topMargin=14*mm,bottomMargin=12*mm,title="Ostali do kraja radionice")
H=ParagraphStyle("h",fontName="AB",fontSize=16,leading=20); P=ParagraphStyle("p",fontName="A",fontSize=9,leading=12,textColor=colors.HexColor("#444"))
klik=sum(1 for x in rows if x["Klik ponuda"]!="0"); st=sum(1 for r in data[1:] if r[3])
story=[Paragraph("Ostali do kraja radionice (16. 11. 2026)",H),Spacer(1,4),
 Paragraph(f"{len(rows)} osoba je gledalo do poslednjeg, 68. minuta. Prvo idu oni koji su kliknuli na ponudu ({klik}), pa ostali, po dužini gledanja. Telefon postoji za {st} osoba.",P),Spacer(1,8)]
t=Table(data,colWidths=[9*mm,30*mm,60*mm,27*mm,15*mm,10*mm,10*mm,15*mm],repeatRows=1)
st_=[("FONT",(0,0),(-1,0),"AB",8),("FONT",(0,1),(-1,-1),"A",7.5),("BACKGROUND",(0,0),(-1,0),colors.HexColor("#222")),("TEXTCOLOR",(0,0),(-1,0),colors.white),
 ("VALIGN",(0,0),(-1,-1),"MIDDLE"),("ROWBACKGROUNDS",(0,1),(-1,-1),[colors.white,colors.HexColor("#f3f3f3")]),("TOPPADDING",(0,0),(-1,-1),2),("BOTTOMPADDING",(0,0),(-1,-1),2)]
t.setStyle(TableStyle(st_))
story.append(t)
def br(c,d):
    c.setFont("A",7);c.setFillColor(colors.grey);c.drawRightString(A4[0]-12*mm,7*mm,f"strana {d.page}")
doc.build(story,onFirstPage=br,onLaterPages=br)
print(len(rows),klik,st)

import type { AdvisorLines, VoiceLines } from './voices';

/**
 * Gesprochene Zeilen der Einheiten und Bewohner (Deutsch). Alles Eigenentwürfe.
 * Schlüssel einer Zeile: `<Gruppe>.<Ereignis>.<Nr>` (Nr ab 1 in der Reihenfolge der Liste), z. B. `archer.select.1`.
 * Mindestens drei Varianten je Ereignis (Test `voices.test.ts`). Zeilen sind kurz (ein bis zwei Sekunden Sprechzeit),
 * damit Rückmeldungen den Spielfluss nicht aufhalten.
 */
export const VOICE_DE: VoiceLines = {
  // ---------------------------------------------------------------- Kämpfer
  swordsman: {
    select: ['Schwert bereit.', 'Wir hören, Herr.', 'Zu Euren Diensten.', 'Die Klingen sind geschliffen.'],
    move: ['Wir rücken vor.', 'Marsch, Männer!', 'Verstanden, wir marschieren.', 'Wir gehen.'],
    attack: ['Auf sie!', 'Für unsere Burg!', 'Schilde hoch, dann zuschlagen!', 'Zum Angriff!'],
    hold: ['Wir halten die Stellung.', 'Hier kommt keiner durch.', 'Schilde zusammen!', 'Wir stehen wie ein Fels.'],
    wounded: ['Das war ein harter Treffer!', 'Ich blute, aber ich kämpfe weiter.', 'Ich brauche Hilfe!'],
  },
  spearman: {
    select: ['Speer erhoben.', 'Wir sind bereit.', 'Gebt uns die Richtung.', 'Spitzen nach vorn.'],
    move: ['Wir ziehen los.', 'In Reihe, folgt mir!', 'Den Speer geschultert, Marsch!', 'Verstanden, Herr.'],
    attack: ['Speere vor!', 'Haltet die Linie und stoßt zu!', 'Angriff, Spitzen nach vorn!'],
    hold: ['Spieße gesenkt, wir halten.', 'Reiter kommen hier nicht durch.', 'Die Reihe steht.'],
    wounded: ['Mich hat es erwischt!', 'Ich kann noch stehen.', 'Zu schwer verletzt, Herr!'],
  },
  archer: {
    select: ['Unsere Bögen sind bereit.', 'Die Pfeile sind im Köcher.', 'Wohin zielen wir?', 'Wir haben ein scharfes Auge.'],
    move: ['Wir beziehen Stellung.', 'Wir gehen in Position.', 'Schnell, bevor sie uns sehen.', 'Von der Anhöhe sehen wir besser.'],
    attack: ['Bogen spannen, Männer!', 'Zielt und lasst fliegen!', 'Der Himmel wird dunkel von Pfeilen!', 'Freie Schussbahn, Feuer!'],
    hold: ['Wir decken die Mauer.', 'Von hier haben wir jeden Feind im Visier.', 'Wir halten die Zinnen.'],
    wounded: ['Ich bin getroffen!', 'Mein Arm, mein Bogenarm!', 'Deckung, ich bin verwundet!'],
  },
  crossbow: {
    select: ['Bolzen gespannt.', 'Die Armbrust ist geladen.', 'Ruhige Hand, scharfes Auge.', 'Wir hören.'],
    move: ['Wir verlegen.', 'Spannen im Gehen, los!', 'Neue Stellung, verstanden.'],
    attack: ['Bolzen frei!', 'Ziel erfasst, Feuer!', 'Durch jede Rüstung!'],
    hold: ['Wir halten die Linie.', 'Kein Schritt weiter für sie.', 'Die Sehne ist gespannt, wir warten.'],
    wounded: ['Mich hat ein Pfeil erwischt!', 'Ich kann kaum noch spannen!', 'Zurück, ich bin verletzt!'],
  },
  knight: {
    select: ['Ich höre, Herr.', 'Das Pferd ist gesattelt.', 'Bereit zum Ritt.', 'Nennt mir das Ziel.'],
    move: ['Im Galopp voran!', 'Ich reite sofort.', 'Aus dem Weg, ich komme!', 'Die Hufe donnern, wir reiten.'],
    attack: ['Zur Attacke!', 'Lanzen nieder und drauf!', 'Für Ehre und Burg!', 'Reiter, vorwärts!'],
    hold: ['Wir halten die Flanke.', 'Das Pferd steht ruhig, ich wache.', 'Hier kommt keiner vorbei.'],
    wounded: ['Mein Pferd ist verletzt!', 'Der Panzer hält noch.', 'Ich bin angeschlagen, aber nicht besiegt.'],
  },
  mercenary: {
    select: ['Der Sold stimmt, was ist zu tun?', 'Sagt, wohin.', 'Wir sind Euer, solange die Münzen klingen.', 'Bei den Dünen, ich höre.'],
    move: ['Wir ziehen los.', 'Schnell wie der Wüstenwind.', 'Ein Befehl, ein Weg.', 'Wir folgen dem Befehl.'],
    attack: ['Für den Sold!', 'Zeigt ihnen den Wüstenstahl!', 'Angriff, wie der Sturm über die Dünen!'],
    hold: ['Wir halten, solange der Sold reicht.', 'Wir rühren uns nicht.', 'Die Dünen sind unser Schild.'],
    wounded: ['Das kostet extra!', 'Ich blute, Herr.', 'Das war ein guter Schlag.'],
  },
  assassin: {
    select: ['Ich bin nur ein Schatten.', 'Sagt, wer fallen soll.', 'Lautlos wie der Wind.'],
    move: ['Ich schleiche.', 'Niemand wird mich sehen.', 'Unbemerkt wie Rauch.'],
    attack: ['Der Dolch trifft zuerst.', 'Ein Stich, kein Laut.', 'Für dich ist es zu spät.'],
    hold: ['Ich lauere.', 'Ich warte im Dunkeln.', 'Geduld ist meine Waffe.'],
    wounded: ['Ich wurde gesehen!', 'Das tat weh.', 'Entdeckt, zurück in den Schatten!'],
  },
  siege: {
    select: ['Das Geschütz ist bereit.', 'Die Mannschaft ist angetreten.', 'Schmiert die Achsen!', 'Wir schieben es, Herr.'],
    move: ['Zieht! Zieht!', 'Langsam und gleichmäßig, es ist schwer.', 'Alle Mann an die Seile!', 'Wir schaffen es hin.'],
    attack: ['Ziel erfasst, Feuer!', 'Stein ab!', 'Ladet nach und lasst fliegen!', 'Die Mauern wackeln, bald fallen sie!'],
    hold: ['Wir bleiben in Stellung.', 'Das Geschütz ist gesichert.', 'Wir warten auf Euer Zeichen.'],
    wounded: ['Das Gerät ist beschädigt!', 'Die Mannschaft ist dezimiert!', 'Wir brauchen einen Ingenieur!'],
    special: ['Der Arm ist gespannt.', 'Vorsicht, es schlägt gleich ein!', 'Gerät geladen.'],
  },
  engineer: {
    select: ['Zeit zum Tüfteln.', 'Das Werkzeug ist bereit.', 'Ich rechne nach.', 'Was soll ich bauen?'],
    move: ['Ich bin unterwegs.', 'Die Pläne unter dem Arm.', 'Bin gleich da.'],
    attack: ['Das gehen wir mit Köpfchen an.', 'Leitern an die Mauer!', 'Wir untergraben das Fundament.'],
    hold: ['Ich sichere das Gerät.', 'Hier bleibt alles stabil.', 'Ich bleibe bei den Maschinen.'],
    wounded: ['Meine Pläne!', 'Autsch, die Hände brauche ich noch.', 'Ich bin getroffen!'],
    special: ['Schnell geflickt.', 'Das hält wieder.', 'Ein paar Nägel, und es läuft.'],
  },
  monk: {
    select: ['Friede sei mit dir.', 'Der Himmel segne dich.', 'Wie kann ich helfen?'],
    move: ['Ich gehe, wohin die Not ruft.', 'Schnellen Schrittes, Herr.', 'Ich eile.'],
    attack: ['Gott vergebe mir.', 'Auch ein Stab ist eine Waffe.', 'Ich greife an, in Demut.'],
    hold: ['Ich bete für unsere Mauern.', 'Hier wache ich.', 'Ich bleibe bei den Verwundeten.'],
    wounded: ['Gott steh mir bei!', 'Ich kann mich nicht selbst heilen!', 'Autsch, die Kutte brennt!'],
    special: ['Der Segen wirkt.', 'Du bist wieder heil.', 'Es war nur ein Kratzer.'],
  },
  lord: {
    select: ['Sprecht, ich höre.', 'Ich höre Euch.', 'Was gibt es?', 'Redet, ich höre zu.'],
    move: ['Ich gehe selbst.', 'Folgt mir.', 'Der Weg ist frei.'],
    attack: ['Für mein Haus!', 'Dem Feind entgegen!', 'Folgt Eurem Herrn!'],
    hold: ['Hier ist mein Platz.', 'Die Burg fällt nicht.', 'Ich weiche nicht.'],
    wounded: ['Das schmerzt, doch ich lebe.', 'Man hat mich getroffen!', 'Haltet sie von mir fern!'],
    special: ['Haus und Volk sind mir anvertraut.', 'Wir haben viel aufgebaut.', 'Diese Mauern werden bestehen.'],
  },
  // ---------------------------------------------------------------- Bewohner
  peasant: {
    select: ['Die Felder warten.', 'Ja, Herr, was gibt es?', 'Gibt es Arbeit?', 'Womit kann ich helfen?'],
    move: ['Ja, ich gehe schon.', 'Bin schon unterwegs.', 'Dann eben dorthin.', 'Ich bin gleich da.'],
    attack: ['Ich bin kein Kämpfer!', 'Mit der Heugabel?', 'Muss das wirklich sein?'],
    hold: ['Ich bleibe hier.', 'Dann warte ich eben.', 'Hier ist es sicher genug, oder?'],
    work: ['Die Arbeit macht sich nicht von allein.', 'Immer weiter, immer weiter.', 'Noch ein Handgriff.', 'Die Sonne steht schon hoch.'],
    done: ['Fertig!', 'So, das wäre geschafft.', 'Wieder ein Stück Arbeit weniger.'],
    wounded: ['Aua, das tut weh!', 'Zu Hilfe!', 'Rettet euch!'],
  },
  woodcutter: {
    select: ['Ich mache mich an die Arbeit.', 'Die Axt ist scharf.', 'Holz wächst nicht auf dem Markt.', 'Was braucht Ihr?'],
    move: ['Ich nehme die Axt mit.', 'Zum nächsten Wald.', 'Dann gehe ich dorthin.'],
    work: ['Hier fällt der nächste Baum.', 'Achtung, Baum fällt!', 'Es riecht nach frischem Holz.', 'Noch ein Schlag, dann kippt er.'],
    done: ['Das Holz ist gestapelt.', 'Wieder eine Fuhre fertig.', 'Der Stapel wächst.'],
  },
  mason: {
    select: ['Stein um Stein.', 'Der Meißel ruht nicht.', 'Ich höre, Herr.', 'Der Fels wartet schon.'],
    move: ['Ich nehme den Hammer mit.', 'Zum Steinbruch.', 'Schon unterwegs.'],
    work: ['Stein um Stein baut man eine Burg.', 'Der Fels gibt nach.', 'Das klingt nach gutem Gestein.', 'Noch ein Brocken.'],
    done: ['Ein sauberer Block.', 'Die Fuhre ist beladen.', 'Fest wie der Berg.'],
  },
  farmer: {
    select: ['Das Korn steht gut.', 'Was gibt es, Herr?', 'Die Ernte wartet nicht.'],
    move: ['Ich schaue nach dem Feld.', 'Ich komme schon.', 'Dann eben zum anderen Acker.'],
    work: ['Es wird ein gutes Jahr.', 'Die Ähren sind schwer.', 'Ein Schluck Wasser, dann weiter.', 'Ohne uns wird keiner satt.'],
    done: ['Der Karren ist voll.', 'Die Ernte ist eingefahren.', 'Genug für heute.'],
  },
  baker: {
    select: ['Der Ofen ist heiß.', 'Frisches Brot, Herr?', 'Was darf es sein?'],
    move: ['Ich bringe gleich Brot.', 'Ich muss nur noch den Ofen schließen.', 'Bin schon unterwegs.'],
    work: ['Der Teig geht auf.', 'Es duftet schon.', 'Noch ein Laib in den Ofen.', 'Brot für alle.'],
    done: ['Frisch aus dem Ofen!', 'Das Brot ist fertig.', 'Der Duft zieht durch die Gassen.'],
  },
  miller: {
    select: ['Die Flügel drehen sich.', 'Mahlen, mahlen, mahlen.', 'Hier ist die Mühle.'],
    move: ['Ich schaue nach dem Wind.', 'Ich komme, sobald der Stein steht.', 'Bin schon unterwegs.'],
    work: ['Der Wind steht günstig.', 'Das Korn wird zu Mehl.', 'Der Stein mahlt fein.', 'Die Flügel drehen sich schön.'],
    done: ['Das Mehl ist gesackt.', 'Ein Sack voll.', 'Fein gemahlen.'],
  },
  brewer: {
    select: ['Das Bier gärt.', 'Ein Humpen gefällig?', 'Was kann ich Euch einschenken?'],
    move: ['Ich bringe gleich ein Fass.', 'Bin schon unterwegs.', 'Nur noch den Zapfhahn schließen.'],
    work: ['Der Hopfen duftet.', 'Der Sud muss ruhen.', 'Ein Probeschluck schadet nicht.', 'Das wird ein kräftiges Bier.'],
    done: ['Das Fass ist voll.', 'Frisch gebraut!', 'Auf Euer Wohl!'],
  },
  smith: {
    select: ['Das Eisen ist heiß.', 'Was soll ich schmieden?', 'Der Amboss wartet.'],
    move: ['Ich lösche nur schnell das Feuer.', 'Ich komme, wenn das Eisen kalt ist.', 'Bin schon unterwegs.'],
    work: ['Schlag um Schlag.', 'Das Feuer muss noch heißer werden.', 'Das wird eine gute Klinge.', 'Die Funken sprühen.'],
    done: ['Fertig geschmiedet.', 'Das hält, versprochen.', 'Ein Meisterstück.'],
  },
  trader: {
    select: ['Gute Ware, faire Preise.', 'Was darf es sein?', 'Gold öffnet jede Tür.'],
    move: ['Ich packe zusammen.', 'Meine Ware reist mit.', 'Bin schon unterwegs.'],
    work: ['Dattelwein, frisch und kühl!', 'Stoffe aus fernen Städten!', 'Hier gibt es die besten Preise der Stadt!', 'Wer kauft, der gewinnt!'],
    done: ['Ein gutes Geschäft.', 'Das Gold klingt schön.', 'Abgemacht.'],
  },
};

/**
 * Zeilen des Hofberaters (Stimme `advisor`). Schlüssel frei vergeben, Präfix `advisor.`.
 * `alarm` = dringend gesprochen (schneller, eindringlicher), sonst ruhig.
 * Die Ereignislogik des Beraters (ui/advisor.ts) kann diese Schlüssel nutzen; eigene Zeilen dort bleiben möglich,
 * dann spricht das System sie über den Ersatz (Browser-Sprachausgabe), bis sie hier ergänzt und neu erzeugt werden.
 */
export const ADVISOR_DE: AdvisorLines = {
  'advisor.wood.low': { text: 'Herr, das Holz wird knapp.' },
  'advisor.wood.none': { text: 'Wir haben kein Holz mehr!', alarm: true },
  'advisor.stone.low': { text: 'Der Stein geht zur Neige.' },
  'advisor.iron.low': { text: 'Das Eisen reicht bald nicht mehr.' },
  'advisor.food.low': { text: 'Der Kornspeicher leert sich.' },
  'advisor.food.none': { text: 'Das Volk hungert, Herr!', alarm: true },
  'advisor.food.variety': { text: 'Dem Volk fehlt Abwechslung beim Essen.' },
  'advisor.gold.low': { text: 'Die Schatzkammer ist fast leer.' },
  'advisor.production.stalled': { text: 'Eine Werkstatt steht still.' },
  'advisor.workers.few': { text: 'Uns fehlen Arbeitskräfte.' },
  'advisor.housing.full': { text: 'Es fehlt an Wohnraum.' },
  'advisor.pop.falling': { text: 'Die Stimmung im Volk sinkt.' },
  'advisor.pop.taxes': { text: 'Eure Steuern belasten das Volk.' },
  'advisor.pop.rations': { text: 'Die knappen Rationen drücken auf die Stimmung.' },
  'advisor.pop.leaving': { text: 'Die ersten Bauern verlassen die Burg.', alarm: true },
  'advisor.pop.good': { text: 'Das Volk ist zufrieden.' },
  'advisor.pop.crowded': { text: 'Die Burg ist überfüllt.' },
  'advisor.enemy.near': { text: 'Feinde nähern sich!', alarm: true },
  'advisor.enemy.attack': { text: 'Wir werden angegriffen!', alarm: true },
  'advisor.enemy.siege': { text: 'Sie bringen Belagerungsgerät!', alarm: true },
  'advisor.enemy.gate': { text: 'Sie stehen vor dem Tor!', alarm: true },
  'advisor.tower.fallen': { text: 'Ein Turm ist gefallen!', alarm: true },
  'advisor.wall.breach': { text: 'Die Mauer ist durchbrochen!', alarm: true },
  'advisor.keep.danger': { text: 'Der Bergfried ist in Gefahr!', alarm: true },
  'advisor.fire': { text: 'Feuer in der Burg!', alarm: true },
  'advisor.growth': { text: 'Unsere Siedlung wächst.' },
  'advisor.better': { text: 'Die Lage entspannt sich.' },
  'advisor.solved': { text: 'Der Engpass ist behoben.' },
  'advisor.army.ready': { text: 'Unser Heer ist bereit.' },
  'advisor.army.lost': { text: 'Wir haben schwere Verluste, Herr.', alarm: true },
  'advisor.victory': { text: 'Der Sieg gehört uns, Herr!' },
  'advisor.defeat': { text: 'Die Burg ist verloren.' },
  'advisor.idle.calm': { text: 'Alles ist ruhig, Herr. Zu ruhig vielleicht.' },
  'advisor.idle.build': { text: 'Eine starke Mauer kostet Stein, aber spart Blut.' },
  'advisor.idle.market': { text: 'Der Markt zahlt gut, wenn man ihn zu nutzen weiß.' },
  'advisor.hello': { text: 'Willkommen zurück, Herr. Die Burg erwartet Eure Befehle.' },
};

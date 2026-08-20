/**
 * IDEIAS PLURIVET — servidor (Google Apps Script)
 * Guarda as sugestões numa folha do Google Sheets, arquiva os anexos
 * no Google Drive e avisa a administração por email.
 *
 * Instruções de instalação: ver Guia_Instalacao.pdf
 */

// ---------- Configuração ----------
const ADMIN_EMAILS = ['fredericacndl@gmail.com', 'flima@plurivet.pt'];
const SHEET_NAME   = 'Sugestões';
const FOLDER_NAME  = 'Ideias Plurivet — Anexos';
// Pasta do Drive onde vive a folha de sugestões. A subpasta dos anexos é
// criada aqui dentro, para manter o projeto todo arrumado no mesmo sítio.
// Deixar vazio ('') coloca a subpasta na raiz do Drive.
const PARENT_FOLDER_ID = '1pZLgEpczeuGH1Lx_cFTaAJUhrXnlZTZw';
const NOTIFICAR_NOVA_IDEIA   = true;  // email à administração quando entra uma sugestão
const NOTIFICAR_AUTOR_ESTADO = false; // email ao colaborador quando o estado muda

const HEADERS = ['ID','Data','Colaborador','Email','Sugestão','Área','Estado','Descrição','Anexos'];

// ---------- Pontos de entrada ----------
function doGet(e) {
  try {
    return json({ ok: true, ideas: listIdeas() });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.action === 'create') return json({ ok: true, ideas: createIdea(body.idea) });
    if (body.action === 'status') return json({ ok: true, ideas: updateStatus(body.id, body.status) });
    return json({ ok: false, error: 'Ação desconhecida' });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---------- Folha ----------
function sheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) sh = ss.insertSheet(SHEET_NAME);
  if (sh.getLastRow() === 0) {
    sh.appendRow(HEADERS);
    sh.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold').setBackground('#eaf5ea');
    sh.setFrozenRows(1);
    sh.setColumnWidth(5, 260);
    sh.setColumnWidth(8, 420);
  }
  return sh;
}

function listIdeas() {
  const sh = sheet();
  if (sh.getLastRow() < 2) return [];
  const rows = sh.getRange(2, 1, sh.getLastRow() - 1, HEADERS.length).getValues();
  return rows.filter(r => r[0]).map(r => ({
    id: Number(r[0]),
    date: formatDate(r[1]),
    person: String(r[2]),
    email: String(r[3]).toLowerCase(),
    title: String(r[4]),
    area: String(r[5]),
    status: String(r[6]),
    description: String(r[7]),
    files: parseFiles(r[8])
  })).reverse();
}

function createIdea(idea) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const urls = saveAttachments(idea.files || [], idea.title);
    sheet().appendRow([
      idea.id, idea.date, idea.person, idea.email,
      idea.title, idea.area, 'Nova', idea.description,
      JSON.stringify(urls)
    ]);
    if (NOTIFICAR_NOVA_IDEIA) notifyAdmins(idea);
    return listIdeas();
  } finally {
    lock.releaseLock();
  }
}

function updateStatus(id, status) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = sheet();
    const ids = sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), 1).getValues();
    for (let i = 0; i < ids.length; i++) {
      if (String(ids[i][0]) === String(id)) {
        const row = i + 2;
        sh.getRange(row, 7).setValue(status);
        if (NOTIFICAR_AUTOR_ESTADO) {
          const r = sh.getRange(row, 1, 1, HEADERS.length).getValues()[0];
          if (r[3]) {
            MailApp.sendEmail({
              to: r[3],
              subject: 'Ideias Plurivet — a tua sugestão está ' + status.toLowerCase(),
              htmlBody: '<p>Olá ' + r[2] + ',</p><p>A sugestão <b>' + r[4] +
                        '</b> passou ao estado <b>' + status + '</b>.</p><p>Obrigada pela participação.</p>'
            });
          }
        }
        break;
      }
    }
    return listIdeas();
  } finally {
    lock.releaseLock();
  }
}

// ---------- Anexos ----------
function folder() {
  // Procura a subpasta de anexos dentro da pasta do projeto; cria-a se faltar.
  if (PARENT_FOLDER_ID) {
    try {
      const parent = DriveApp.getFolderById(PARENT_FOLDER_ID);
      const it = parent.getFoldersByName(FOLDER_NAME);
      return it.hasNext() ? it.next() : parent.createFolder(FOLDER_NAME);
    } catch (err) {
      // ID de pasta inválido ou sem acesso: continua na raiz, sem falhar o envio
    }
  }
  const it = DriveApp.getFoldersByName(FOLDER_NAME);
  return it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER_NAME);
}

function saveAttachments(files, title) {
  if (!files.length) return [];
  const f = folder();
  const stamp = Utilities.formatDate(new Date(), 'Europe/Lisbon', 'yyyy-MM-dd_HH-mm');
  return files.map((file, i) => {
    try {
      const parts = String(file.data).split(',');
      const meta = parts[0] || '';
      const mime = (meta.match(/data:([^;]+);/) || [null, file.type || 'application/octet-stream'])[1];
      const blob = Utilities.newBlob(Utilities.base64Decode(parts[1]), mime,
                                     stamp + '_' + slug(title) + '_' + (i + 1) + '_' + file.name);
      const saved = f.createFile(blob);
      saved.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      const id = saved.getId();
      return {
        name: file.name,
        type: mime,
        url: mime.indexOf('image/') === 0
          ? 'https://drive.google.com/thumbnail?id=' + id + '&sz=w1000'
          : 'https://drive.google.com/file/d/' + id + '/view'
      };
    } catch (err) {
      return { name: file.name, type: file.type || '', url: '' };
    }
  });
}

function parseFiles(v) {
  if (!v) return [];
  try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch (e) { return []; }
}

// ---------- Notificações ----------
function notifyAdmins(idea) {
  try {
    MailApp.sendEmail({
      to: ADMIN_EMAILS.join(','),
      subject: 'Nova sugestão de ' + idea.person + ' — ' + idea.title,
      htmlBody:
        '<div style="font-family:Arial,sans-serif;color:#18301d">' +
        '<h2 style="color:#205b25;margin:0 0 6px">Nova sugestão na app Ideias Plurivet</h2>' +
        '<p style="margin:0 0 16px;color:#6c776f">' + idea.person + ' &lt;' + idea.email + '&gt;</p>' +
        '<p><b>Título:</b> ' + idea.title + '<br><b>Área:</b> ' + idea.area + '</p>' +
        '<p style="background:#f6f8f6;border-left:3px solid #2f7d32;padding:12px 14px;white-space:pre-wrap">' +
        idea.description + '</p>' +
        '<p><a href="' + SpreadsheetApp.getActiveSpreadsheet().getUrl() + '">Abrir a folha de sugestões</a></p>' +
        '</div>'
    });
  } catch (err) {
    // um falhanço no email nunca deve impedir o registo da sugestão
  }
}

// ---------- Auxiliares ----------
function formatDate(v) {
  if (v instanceof Date) return Utilities.formatDate(v, 'Europe/Lisbon', 'yyyy-MM-dd');
  return String(v).slice(0, 10);
}
function slug(s) {
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40).toLowerCase();
}

import * as path from "@std/path";
import { sortBy } from "@std/collections";

async function fileExists(filepath: string): Promise<boolean> {
  try {
    return (await Deno.lstat(filepath)).isFile;
  } catch {
    return false;
  }
}

export async function exec(cmd: string, ...args: string[]) {
  const command = new Deno.Command(cmd, {
    args,
    stdout: "piped",
    stderr: "piped",
  });
  const { code, success, stdout, stderr } = await command.output();
  if (!success) {
    throw `ERROR: "${cmd} ${args.join(" ")}" returned code ${code}
  ${new TextDecoder().decode(stderr)}`;
  }
  return new TextDecoder().decode(stdout);
}

async function pdftotext(file: string) {
  // last argument causes pdftotext to print to sdtout, so it can be captured
  return await exec("pdftotext", file, "-");
}
async function ocrmypdf(file: string) {
  const ocr_pdf = file.replace(".pdf", ".ocr.pdf");
  if (!(await fileExists(ocr_pdf))) {
    console.error(`producing ${ocr_pdf} ...`);
    // https://ocrmypdf.readthedocs.io/en/latest/cookbook.html
    await exec(
      "ocrmypdf",
      "--deskew", // try to correct rotated scans
      "--clean-final", // reduce background in .ocr.pdf file
      "--force-ocr", // ignore existing OCR data from scanners in output
      "-l", // language assumption
      "deu", // german
      file,
      ocr_pdf,
    );
  }
  return ocr_pdf;
}

type Entry = {
  sort: string;
  date: string;
  descr: string;
  amount: number;
  hasDate: boolean;
  hasAmount: boolean;
};
const MONTHS = {
  "01": "Januar",
  "02": "Februar",
  "03": "März",
  "04": "April",
  "05": "Mai",
  "06": "Juni",
  "07": "Juli",
  "08": "August",
  "09": "September",
  "10": "Oktober",
  "11": "November",
  "12": "Dezember",
};

const isOcrPdf = (filename: string) => /\.ocr\.pdf$/i.test(filename);
const isPdf = (filename: string) =>
  /\.pdf$/i.test(filename) && !isOcrPdf(filename);

async function getPdfEntry(
  folder: string,
  filename: string,
): Promise<Entry | undefined> {
  const filepath = path.join(folder, filename);
  let text = (await pdftotext(filepath)).trim();
  console.error(filename, "contains", text.length, "bytes of text");
  if (!text) {
    const ocrpdfpath = await ocrmypdf(filepath);
    text = (await pdftotext(ocrpdfpath)).trim();
  }
  const parts = filename.replace(/\.pdf$/i, "").match(
    /(\d\d\d\d)-(\d\d)-(\d\d) (.*) ([\d,.]+)/,
  );
  //console.log(text.length, parts)
  if (!parts) {
    return;
  }
  const [, year, month, day, descr, amount] = parts;
  const _ = "[ .]+";
  const patterns = [
    // dd mm yyyy
    `${day}${_}${month}${_}${year}`,
    // dd mm yy
    `${day}${_}${month}${_}${year.substring(2)}`,
    // d m yyyy
    `${day.replace(/^0/, "")}${_}${month.replace(/^0/, "")}${_}${year}`,
    // d m yy
    `${day.replace(/^0/, "")}${_}${month.replace(/^0/, "")}${_}${
      year.substring(2)
    }`,
    // long month name
    `${day}${_}${MONTHS[month as keyof typeof MONTHS]}${_}${year}`,
    // short month name
    `${day}${_}${
      MONTHS[month as keyof typeof MONTHS].substring(0, 3)
    }${_}${year}`,
  ] as const;
  const hasDate = new RegExp(
    patterns.join("|"),
  ).test(text);
  if (!hasDate) {
    console.error(
      "potential dates:",
      text.matchAll(new RegExp(`.+${year}`, "gu"))
        .toArray()
        .map((arr) => arr[0]),
    );
  }
  const hasAmount = new RegExp(
    `${amount}|${amount.replace(/[,.]/, "[,. ]+")}`,
  ).test(text);
  return {
    sort: filename,
    date: `${day}.${month}`,
    hasDate,
    descr,
    amount: parseFloat(amount.replace(",", ".")),
    hasAmount,
  };
}

// Learn more at https://docs.deno.com/runtime/manual/examples/module_metadata#concepts
if (import.meta.main) {
  for (const arg of Deno.args) {
    const stats = await Deno.lstat(arg);
    if (stats.isDirectory) {
      console.error(arg);
      const data: Entry[] = [];
      for await (const dirEntry of Deno.readDir(arg)) {
        if (!dirEntry.isFile) {
          console.error("IGNORED:", dirEntry.name);
          continue;
        }
        if (isOcrPdf(dirEntry.name)) {
          continue;
        }
        if (isPdf(dirEntry.name)) {
          const entry = await getPdfEntry(arg, dirEntry.name);
          if (!entry) {
            console.error(
              "Filename not matching pattern 'YYYY-MM-DD DESCRIPTION AMOUNT.pdf'!",
            );
            continue;
          }
          data.push(entry);
          if (!entry.hasDate || !entry.hasAmount) {
            console.log(entry);
          }
        } else {
          console.error(`IGNORING unsupported file format`);
        }
      }
      console.log();
      console.log(
        sortBy(data, (entry) => entry.sort).map((it) =>
          `${it.date}\t${it.descr}\t${it.amount.toFixed(2)}`
        ).join("\n"),
      );
      console.log(
        "SUM",
        data.reduce((sum, { amount }) => sum + amount, 0).toFixed(2),
      );
      console.log(
        "TAX SUM",
        data.reduce((sum, { amount }) => sum + Math.ceil(amount), 0).toFixed(2),
      );
    }
  }
}

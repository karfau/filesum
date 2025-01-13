# filesum

Analysis for directories containing pdf files with the following naming scheme:

`YYYY-MM-DD DESCRIPTION AMOUNT.pdf`

Checks if the date and amount in the filename are contained in the PDF file
and prints tsv (German date format without month, descr, amount) 
and sum and tax sum (ceiling for each amount).

All Files that are not pdf or do not match the pattern are ignored.
Creates `.ocr.pdf` for each pdf that doesn't have any text using [`ocrmypdf`](https://ocrmypdf.readthedocs.io/en/latest/installation.html).
Text extraction prom pdf file is done with [`pdftotext`](https://poppler.freedesktop.org/).

to run the script:

`deno task dev /path/to/directory/containing/pdfs`

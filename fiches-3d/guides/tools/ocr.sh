#!/bin/bash
# usage : OCR_DIR=ocr tools/ocr.sh <livre> <fichier.pdf> <page>   (Tesseract, langue fra, 300 dpi)
mkdir -p ${OCR_DIR:-ocr}/$1
k=$1; f=$2; p=$3
out=${OCR_DIR:-ocr}/$k/$(printf %03d $p)
[ -s $out.tsv ] && exit 0
tmp=$(mktemp -d)
pdftoppm -r 300 -gray -f $p -l $p -png "$f" $tmp/x
OMP_THREAD_LIMIT=1 tesseract $tmp/x*.png $out -l fra --psm 3 txt tsv >/dev/null 2>&1
rm -rf $tmp

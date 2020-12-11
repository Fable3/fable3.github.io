BEGIN{FS=";"}
{if(length($0)>3) print ($1>=200?"hsk2":"hsk1") ";" ($1>=200?$1-200:$1) ";" $2 ";" $3 ";" $4 ";" $5;else print}

BEGIN{FS=";";while(getline<"words.txt"){found[$2]=1}}
{if (NF>1 && !($1 in found)) print;}

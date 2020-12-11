BEGIN{FS=";";while(getline<"words.txt"){found[$3]=1}}
{if (NF>1 && !($1 in found)) print;}

BEGIN{i=0}
{if(length($0)>3) print "hsk3;" ++i ";" $0;else print}

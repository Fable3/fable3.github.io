BEGIN{i=200}
{if(length($0)>3) print ++i ";" $0;else print}

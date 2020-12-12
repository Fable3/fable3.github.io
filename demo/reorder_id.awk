BEGIN{i=0;FS=";"}
{
if(length($0)>3)
{
	$1="hsk3";
	$2=++i;
	for(r=1;r<=5;r++) printf("%s;", $r);
	print $6;
} else print $0
}

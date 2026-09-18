"use client";
import {useState} from "react";
import {Menu,X,ArrowUpRight} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Brand} from "@/components/brand";
export function SiteHeader(){const[open,setOpen]=useState(false);return <header className="site-header"><div className="shell header-inner"><Brand/><nav className="desktop-nav" aria-label="Hoofdnavigatie"><a href="/#aanpak">Onze aanpak</a><a href="/#voor-wie">Voor wie</a><a href="/#vragen">Vragen</a></nav><Button asChild className="header-cta"><a href="/intake">Start online intake <ArrowUpRight size={19}/></a></Button><Button variant="ghost" size="icon" className="menu-toggle" aria-label={open?"Menu sluiten":"Menu openen"} aria-expanded={open} aria-controls="mobile-nav" onClick={()=>setOpen(!open)}>{open?<X/>:<Menu/>}</Button></div>{open&&<nav id="mobile-nav" className="mobile-nav" aria-label="Mobiele navigatie"><a href="/#aanpak" onClick={()=>setOpen(false)}>Onze aanpak</a><a href="/#voor-wie" onClick={()=>setOpen(false)}>Voor wie</a><a href="/#vragen" onClick={()=>setOpen(false)}>Vragen</a><a href="/intake">Start online intake</a></nav>}</header>}


package fr.stl2step.core;

import java.util.Arrays;

/** Liste d'entiers sans boxing. */
public final class IntList {
    private int[] a = new int[8];
    private int n;

    public void add(int x) {
        if (n == a.length) a = Arrays.copyOf(a, n * 2);
        a[n++] = x;
    }

    public int get(int i) { return a[i]; }
    public void set(int i, int x) { a[i] = x; }
    public int size() { return n; }
    public boolean isEmpty() { return n == 0; }

    public void removeAt(int i) {
        System.arraycopy(a, i + 1, a, i, n - i - 1);
        n--;
    }

    public int last() { return a[n - 1]; }
    public int[] toArray() { return Arrays.copyOf(a, n); }
}
